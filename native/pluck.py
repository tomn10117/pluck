#!/usr/bin/env python3
"""
Pluck (native) — identify the song in the front browser tab's YouTube video and
add it to Apple Music. No browser extension required.

Pipeline:
  1. Read the active tab URL from the front browser (Chrome / Safari / Arc).
  2. oEmbed → video title + channel  (replaces the old in-page DOM extraction).
  3. Parse the noisy title → {artist, title}  (ported from metadata-extractor.js).
  4. iTunes Search API → best-matching Apple Music track  (ported from itunes-search.js).
  5. Open in Music.app + click "Add to Library" via AppleScript  (from host.py).
  6. macOS notification with the result.

Pure stdlib — no pip installs.
"""

import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Pluck/1.0"


# ─── 1. Front browser tab URL ──────────────────────────────────────────────

# Try each browser in order; first one that's running + has a front window wins.
_BROWSER_SCRIPTS = [
    ('Google Chrome', 'tell application "Google Chrome" to return URL of active tab of front window'),
    ('Arc',           'tell application "Arc" to return URL of active tab of front window'),
    ('Brave Browser', 'tell application "Brave Browser" to return URL of active tab of front window'),
    ('Safari',        'tell application "Safari" to return URL of current tab of front window'),
]


def front_tab_url():
    for app, script in _BROWSER_SCRIPTS:
        # Only ask apps that are actually running, so we don't launch them.
        running = subprocess.run(
            ['osascript', '-e', f'application "{app}" is running'],
            capture_output=True, text=True
        ).stdout.strip()
        if running != 'true':
            continue
        res = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
        url = res.stdout.strip()
        if url:
            return url
    return None


# ─── 2. oEmbed (title + channel, no API key) ───────────────────────────────

def youtube_video_id(url):
    p = urllib.parse.urlparse(url)
    host = p.netloc.lower()
    if 'youtube.com' in host:
        if p.path == '/watch':
            return urllib.parse.parse_qs(p.query).get('v', [None])[0]
        m = re.match(r'^/(shorts|embed|live)/([\w-]+)', p.path)
        if m:
            return m.group(2)
    if 'youtu.be' in host:
        return p.path.lstrip('/').split('/')[0] or None
    return None


def fetch_oembed(video_id):
    watch = f'https://www.youtube.com/watch?v={video_id}'
    url = 'https://www.youtube.com/oembed?' + urllib.parse.urlencode(
        {'url': watch, 'format': 'json'})
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=8) as r:
        data = json.load(r)
    return {'rawTitle': data.get('title'), 'channel': data.get('author_name')}


# ─── 3. Title parsing (ported from metadata-extractor.js fromTitle) ─────────

_FULL_TITLE_NOISE = [
    r'\(official\s*(music\s*)?video\)',
    r'\[official\s*(music\s*)?video\]',
    r'\(official\s*audio\)',
    r'\(official\s*mv\)',
    r'\(official\s*lyric\s*video\)',
    r'\(lyrics?\s*(video)?\)',
    r'\[lyrics?\]',
    r'\((hd|hq|4k|1080p|720p)\)',
    r'\[(hd|hq|4k|1080p|720p)\]',
    r'\(live[^)]*\)',
    r'\[live[^\]]*\]',
    r'\|\s*official.*$',
    r'//.*$',
    r'【[^】]*】',
    r'「[^」]*」',
    r'\(visualizer\)',
    r'\(audio\)',
    r'\(remaster(ed)?\)',
    r'\(([A-Z]{2,3}[\s/]*)+\)',
]

_TITLE_PART_NOISE = [
    r'\bofficial\s*(music\s*)?video\b',
    r'\bofficial\s*m\.?v\.?\b',
    r'\bofficial\s*audio\b',
    r'\bm\.?v\.?\b',
    r'\blyrics?\b',
]


def parse_title(title):
    if not title:
        return None

    cleaned = title
    for pat in _FULL_TITLE_NOISE:
        cleaned = re.sub(pat, '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned).strip()

    # "Artist - Title"
    m = re.match(r'^(.+?)\s*[-–—]\s*(.+)$', cleaned)
    if m:
        artist = m.group(1).strip()
        song = m.group(2).strip()
        for pat in _TITLE_PART_NOISE:
            song = re.sub(pat, '', song, flags=re.IGNORECASE)
        song = re.sub(r'''^['"'']+|['"'']+$''', '', song).strip()
        song = re.sub(r'\s{2,}', ' ', song).strip()
        if song:
            return {'artist': artist, 'title': song}

    # "Title by Artist"
    m = re.match(r'^(.+?)\s+by\s+(.+)$', cleaned, flags=re.IGNORECASE)
    if m:
        return {'title': m.group(1).strip(), 'artist': m.group(2).strip()}

    return {'rawTitle': cleaned}


# ─── 4. iTunes search (ported from itunes-search.js) ────────────────────────

ITUNES_API = 'https://itunes.apple.com/search'


def flatten_artist(artist):
    return re.sub(r'\s{2,}', ' ', artist.replace('(', '').replace(')', '')).strip()


def build_queries(artist, title):
    queries = []
    if artist and title:
        queries.append(f'{flatten_artist(artist)} {title}')
        if flatten_artist(artist) != artist:
            queries.append(f'{artist} {title}')
    if title:
        queries.append(title)
    if artist:
        queries.append(flatten_artist(artist))
    seen, out = set(), []
    for q in queries:
        if q and q not in seen:
            seen.add(q)
            out.append(q)
    return out


_NORM_RE = re.compile(
    r'[^a-z0-9ᄀ-ᇿ぀-ヿ㄰-㆏가-힣一-鿿]')


def _norm(s):
    return _NORM_RE.sub('', s.lower()) if s else ''


def best_match(results, artist):
    if not artist:
        return results[0]
    target = _norm(flatten_artist(artist))
    for r in results:
        a = _norm(r.get('artistName', ''))
        if a and target and (target in a or a in target):
            return r
    return results[0]


def fetch_best(term, artist):
    url = ITUNES_API + '?' + urllib.parse.urlencode(
        {'term': term, 'media': 'music', 'entity': 'song', 'limit': 5})
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.load(r)
    except Exception:
        return None
    results = data.get('results') or []
    return best_match(results, artist) if results else None


def search_apple_music(artist, title):
    for term in build_queries(artist, title):
        track = fetch_best(term, artist)
        if track:
            return track
    return None


# ─── 5. Add to Music.app (from host.py) ─────────────────────────────────────

_ADD_SCRIPT = r'''
tell application "Music" to activate
delay 1.0
tell application "System Events"
    tell process "Music"
        set frontmost to true
        delay 0.5
        try
            set win to window 1
            set allBtns to every button of win
            repeat with btn in allBtns
                try
                    set d to description of btn
                    if d contains "Add" or d contains "Library" then
                        click btn
                        return "clicked:" & d
                    end if
                end try
            end repeat
        end try
        try
            set allBtns to every button of toolbar 1 of window 1
            repeat with btn in allBtns
                try
                    set d to description of btn
                    if d contains "Add" or d contains "Library" then
                        click btn
                        return "clicked toolbar:" & d
                    end if
                end try
            end repeat
        end try
    end tell
end tell
return "not found"
'''


def add_to_music(track):
    url = track.get('trackViewUrl', '')
    if not url:
        return False, 'No trackViewUrl'
    music_url = url.replace('https://', 'music://')
    subprocess.run(['open', '-a', 'Music', music_url], check=True)
    time.sleep(2.5)
    res = subprocess.run(['osascript', '-e', _ADD_SCRIPT],
                         capture_output=True, text=True, timeout=15)
    out = res.stdout.strip()
    return ('clicked' in out), (out or res.stderr.strip())


# ─── 6. Notification ────────────────────────────────────────────────────────

def notify(title, message):
    subprocess.run(
        ['osascript', '-e',
         f'display notification {json.dumps(message)} with title {json.dumps(title)}'],
        capture_output=True)


# ─── main ───────────────────────────────────────────────────────────────────

def main():
    url = front_tab_url()
    if not url:
        notify('Pluck', 'No front browser window found.')
        print('No front browser tab URL', file=sys.stderr)
        return 1

    vid = youtube_video_id(url)
    if not vid:
        notify('Pluck', 'Front tab is not a YouTube video.')
        print(f'Not a YouTube video: {url}', file=sys.stderr)
        return 1

    try:
        meta = fetch_oembed(vid)
    except Exception as e:
        notify('Pluck', 'Could not read video metadata.')
        print(f'oEmbed failed: {e}', file=sys.stderr)
        return 1

    parsed = parse_title(meta.get('rawTitle')) or {}
    artist = parsed.get('artist')
    title = parsed.get('title') or parsed.get('rawTitle') or meta.get('rawTitle')

    track = search_apple_music(artist, title)
    if not track and meta.get('rawTitle'):
        track = search_apple_music(None, meta['rawTitle'])

    if not track:
        notify('Pluck', f'Couldn’t identify: {meta.get("rawTitle", "?")}')
        print(f'No match for: {meta.get("rawTitle")}', file=sys.stderr)
        return 2

    name = f'{track.get("artistName", "?")} — {track.get("trackName", "?")}'
    print(f'Matched: {name}')

    ok, detail = add_to_music(track)
    if ok:
        notify('Pluck ✓', f'Added: {name}')
    else:
        notify('Pluck ⚠︎', f'Found {name} but add unconfirmed.')
        print(f'Add result: {detail}', file=sys.stderr)
    return 0 if ok else 3


if __name__ == '__main__':
    sys.exit(main())
