// Loaded as a regular content script before youtube.js — defines PluckExtractor as a global.

const PluckExtractor = {

  // Layer 1: YouTube Content ID "Music in this video" section in the DOM.
  // Appears on videos where YouTube's Content ID matched a track.
  fromContentID() {
    const section = document.querySelector('ytd-video-description-music-section-renderer');
    if (!section) return null;

    // Each licensed track is a row with song title + artist
    const rows = section.querySelectorAll('ytd-music-track-attribution-view-model');
    if (rows.length) {
      const row = rows[0];
      const texts = [...row.querySelectorAll('yt-formatted-string, span')]
        .map(el => el.textContent.trim())
        .filter(Boolean);
      if (texts.length >= 2) return { title: texts[0], artist: texts[1] };
      if (texts.length === 1) return { rawTitle: texts[0] };
    }

    // Fallback: parse the section's plain text
    const lines = section.innerText.split('\n').map(s => s.trim()).filter(Boolean)
      .filter(s => s !== 'Music in this video' && !s.startsWith('Learn more'));
    if (lines.length >= 2) return { title: lines[0], artist: lines[1] };
    if (lines.length === 1) return { rawTitle: lines[0] };
    return null;
  },

  // Layer 2: Read ytInitialPlayerResponse from page context via injected script.
  // Content scripts run in an isolated world and can't access window.* directly.
  fromPageData() {
    return new Promise(resolve => {
      const nonce = 'pluck_' + Date.now() + '_' + Math.random().toString(36).slice(2);

      const onMessage = e => {
        if (e.data?.type === nonce) {
          window.removeEventListener('message', onMessage);
          resolve(e.data.result ?? null);
        }
      };
      window.addEventListener('message', onMessage);
      setTimeout(() => { window.removeEventListener('message', onMessage); resolve(null); }, 3000);

      const s = document.createElement('script');
      s.textContent = `(function() {
        try {
          const r = window.ytInitialPlayerResponse;
          if (!r) { window.postMessage({ type: '${nonce}', result: null }, '*'); return; }
          const v = r.videoDetails || {};
          window.postMessage({
            type: '${nonce}',
            result: {
              rawTitle: v.title || null,
              channel: v.author || null,
              category: r.microformat?.playerMicroformatRenderer?.category || null
            }
          }, '*');
        } catch(e) {
          window.postMessage({ type: '${nonce}', result: null }, '*');
        }
      })();`;
      document.head.appendChild(s);
      s.remove();
    });
  },

  // Layer 3: Parse a noisy YouTube video title string.
  fromTitle(title) {
    if (!title) return null;

    const noisePatterns = [
      /\(official\s*(music\s*)?video\)/gi,
      /\[official\s*(music\s*)?video\]/gi,
      /\(official\s*audio\)/gi,
      /\(official\s*mv\)/gi,
      /\(official\s*lyric\s*video\)/gi,
      /\(lyrics?\s*(video)?\)/gi,
      /\[lyrics?\]/gi,
      /\((hd|hq|4k|1080p|720p)\)/gi,
      /\[(hd|hq|4k|1080p|720p)\]/gi,
      /\(live[^)]*\)/gi,
      /\[live[^\]]*\]/gi,
      /\|\s*official.*$/gi,
      /\/\/.*$/gi,
      /【[^】]*】/g,
      /「[^」]*」/g,
      /\(visualizer\)/gi,
      /\(audio\)/gi,
      /\(remaster(ed)?\)/gi,
    ];

    let cleaned = title;
    for (const re of noisePatterns) cleaned = cleaned.replace(re, '');
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    // "Artist - Title" or "Title - Artist" (dash/em-dash/en-dash)
    const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (dashMatch) {
      return { artist: dashMatch[1].trim(), title: dashMatch[2].trim() };
    }

    // "Title by Artist"
    const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) {
      return { title: byMatch[1].trim(), artist: byMatch[2].trim() };
    }

    return { rawTitle: cleaned };
  },
};
