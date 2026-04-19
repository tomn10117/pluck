# Pluck

> Hear a song on YouTube. Add it to Apple Music. One click.

Pluck is a Chrome extension that identifies whatever is playing on YouTube and adds it to your Apple Music library — without an Apple Developer account, without a backend, and without leaving the page.

---

## How it works

```
YouTube video playing
        │
        ▼
  ┌─────────────────────────────────────────────┐
  │           Metadata Extraction               │
  │  Layer 1: YouTube Content ID DOM section    │
  │  Layer 2: ytInitialPlayerResponse (page JS) │
  │  Layer 3: Title string parsing + denoising  │
  └─────────────────────────────────────────────┘
        │
        ▼
  iTunes Search API (free, no key)
  → tries up to 3 queries, most specific first
        │
        ▼
  ┌─────────────────────────────────────────────┐
  │           Add to Apple Music                │
  │  Primary:  Native Music.app via osascript   │
  │  Fallback: MusicKit JS on music.apple.com   │
  └─────────────────────────────────────────────┘
        │
        ▼
  Overlay shows ✓
```

**No Apple Developer account.** The browser fallback piggybacks on the MusicKit instance Apple already loads on `music.apple.com`. The native path uses `osascript` on macOS — no API keys needed either way.

---

## Features

- Floating pill overlay appears on every YouTube watch page
- 3-layer metadata extraction handles clean titles, noisy titles, and Content ID-matched videos
- Handles K-pop / CJK / non-Latin artist names correctly
- Strips common title noise: `Official MV`, `(ENG/CHN)`, `'quoted titles'`, etc.
- Multiple iTunes search query fallbacks before giving up
- Native Music.app integration via one-time install (no browser tab needed after setup)
- Browser fallback via MusicKit JS (zero setup, requires `music.apple.com` open)
- 5s per-request timeout + 12s overall timeout — never hangs

---

## Setup

> Pluck isn't on the Chrome Web Store — you load it directly from source.

### 1. Clone the repo

```bash
git clone https://github.com/tomn10117/pluck.git
cd pluck
```

### 2. Load the extension in Chrome

```
chrome://extensions → Developer mode ON → Load unpacked → select the cloned /pluck folder
```

### 3. Connect to native Music.app (recommended, one-time)

Click the **Pluck icon** in your Chrome toolbar → **Download installer**, then:

```bash
bash ~/Downloads/pluck-install.sh
```

Reload the extension. The popup will show **Native Music app connected**.

> If you skip this step, Pluck falls back to `music.apple.com` in the browser — make sure you're logged in there.

---

## Usage

1. Play any video on `youtube.com` or `music.youtube.com`
2. Pluck identifies the song (~2–5 seconds)
3. A pill appears bottom-right with the track info
4. Click **+** to add to your Apple Music library

---

## Architecture

| File | Role |
|---|---|
| `content-scripts/youtube.js` | Detects navigation, extracts metadata, renders overlay |
| `content-scripts/apple-music.js` | MusicKit bridge on `music.apple.com` |
| `background/service-worker.js` | Orchestrates identify → search → add |
| `utils/metadata-extractor.js` | 3-layer YouTube metadata extraction |
| `utils/itunes-search.js` | iTunes Search API with multi-query fallback |
| `utils/audd.js` | Audio fingerprint stub (AudD — not yet wired) |
| `native-host/host.py` | Native messaging host, adds via `osascript` |
| `popup/` | Setup UI — shows connection status, downloads installer |
| `overlay/overlay.css` | Frosted glass pill styles |

---

## Roadmap

- [ ] **AudD audio fingerprinting** — for Vietnamese reuploads, unlabeled covers, anything where the title gives no signal. Captures 5s of tab audio, returns `{ artist, title, apple_music_id }` directly.
- [ ] **`music.youtube.com` clean metadata** — richer structured data available on YouTube Music, not fully exploited yet
- [ ] **Auto-add mode** — skip the confirm step, add immediately on detection
- [ ] **"Already in library" detection** — skip the pill if you already have the song

---

## Stack

- Chrome Extension Manifest V3
- Vanilla JS — no build step, no dependencies
- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/) — free catalog search
- MusicKit JS (via `music.apple.com` session) — library writes
- Python 3 + `osascript` — native Music.app integration
