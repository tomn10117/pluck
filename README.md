# 🎵 Pluck

**Hear a song on YouTube. Add it to Apple Music. One click.**

No Apple Developer account. No backend. No leaving the page.

---

## What it does

You're watching a YouTube video. A little pill appears in the corner showing the song that's playing. You hit **+**. It's in your Apple Music library. That's it.

```
  ╭──────────────────────────────────╮
  │ 🎵  ONLY                         │
  │     이하이 (LeeHi)  · 2016       │
  │                        [+]  [✕]  │
  ╰──────────────────────────────────╯
```

Works on `youtube.com` and `music.youtube.com`. Handles messy titles, K-pop, CJK scripts, and all the `Official MV (ENG/CHN) 4K` noise YouTube loves to put in video titles.

---

## How it identifies songs

Three layers, tried in order:

| # | Method | Catches |
|---|---|---|
| 🥇 | YouTube Content ID DOM | Licensed tracks YouTube already knows |
| 🥈 | `ytInitialPlayerResponse` page data | Most videos |
| 🥉 | Title string parsing + denoising | Everything else |

Then searches the **iTunes Search API** (free, no key) with up to 3 query variations before giving up.

---

## How it adds to your library

**Native path** (recommended) — talks directly to Music.app on your Mac via a tiny Python script + `osascript`. No browser tab needed.

**Browser fallback** — piggybacks on the MusicKit JS session Apple already loads on `music.apple.com`. Zero extra setup, just needs that tab open.

---

## Setup

> Not on the Chrome Web Store — you load it from source.

**1. Clone**

```bash
git clone https://github.com/tomn10117/pluck.git
```

**2. Load in Chrome**

```
chrome://extensions → Developer mode ON → Load unpacked → select the /pluck folder
```

**3. Connect to native Music.app** *(one-time, recommended)*

Click the **Pluck icon** in your toolbar → **Download installer**, then run:

```bash
bash ~/Downloads/pluck-install.sh
```

Reload the extension. Popup should show **Native Music app connected ✓**

> Skip step 3 and Pluck falls back to the browser — just make sure you're logged into `music.apple.com`.

---

## Stack

- ⚙️ Chrome Extension Manifest V3
- 🍦 Vanilla JS — no build step, no dependencies
- 🔍 iTunes Search API — free catalog search
- 🎸 MusicKit JS — library writes via `music.apple.com` session
- 🐍 Python 3 + `osascript` — native Music.app integration
