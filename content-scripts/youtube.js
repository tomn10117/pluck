// PluckExtractor is injected before this file via manifest content_scripts order.

(function () {
  'use strict';

  let currentVideoId = null;
  let overlayEl = null;

  // ─── Overlay ──────────────────────────────────────────────────────────────

  function getOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.id = 'pluck-overlay';
    overlayEl.className = 'pluck-hidden';
    overlayEl.innerHTML = `
      <div class="pluck-content">
        <img class="pluck-art" src="" alt="" />
        <div class="pluck-info">
          <div class="pluck-title"></div>
          <div class="pluck-artist"></div>
        </div>
        <button class="pluck-btn pluck-add" title="Add to Apple Music">+</button>
        <button class="pluck-btn pluck-dismiss" title="Dismiss">✕</button>
      </div>
    `;
    overlayEl.querySelector('.pluck-add').addEventListener('click', onAdd);
    overlayEl.querySelector('.pluck-dismiss').addEventListener('click', () => hide());
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function show(state, track) {
    const el = getOverlay();
    el.dataset.state = state;
    el.className = '';

    if (track) {
      el.querySelector('.pluck-art').src = track.artworkUrl100?.replace('100x100', '60x60') ?? '';
      el.querySelector('.pluck-title').textContent = track.trackName ?? '';
      el.querySelector('.pluck-artist').textContent = track.artistName ?? '';
      el._track = track;
    }
  }

  function hide() {
    if (overlayEl) overlayEl.className = 'pluck-hidden';
  }

  // ─── Add handler ──────────────────────────────────────────────────────────

  async function onAdd() {
    const track = overlayEl?._track;
    if (!track) return;

    show('adding', track);

    const result = await chrome.runtime.sendMessage({ type: 'ADD_TO_LIBRARY', track });

    if (result?.success) {
      show('added', track);
      setTimeout(hide, 3000);
    } else {
      show('error', track);
      setTimeout(() => show('found', track), 2500);
    }
  }

  // ─── Identification ───────────────────────────────────────────────────────

  async function identifyVideo(videoId) {
    if (videoId !== currentVideoId) return;

    // Layer 1: Content ID DOM section
    let metadata = PluckExtractor.fromContentID();

    // Layer 2: ytInitialPlayerResponse (only worth trying if it looks like music)
    if (!metadata) {
      const pageData = await PluckExtractor.fromPageData();
      if (pageData) {
        if (pageData.category === 'Music') {
          metadata = PluckExtractor.fromTitle(pageData.rawTitle) ?? { rawTitle: pageData.rawTitle };
        } else if (pageData.rawTitle) {
          // Still try title parsing even without the "Music" category
          metadata = PluckExtractor.fromTitle(pageData.rawTitle);
        }
      }
    }

    // Layer 3: Visible page title as last resort
    if (!metadata) {
      const titleEl = document.querySelector(
        'h1.ytd-video-primary-info-renderer yt-formatted-string, ytd-watch-metadata h1 yt-formatted-string, #title h1'
      );
      const raw = titleEl?.textContent?.trim();
      if (raw) metadata = PluckExtractor.fromTitle(raw);
    }

    if (!metadata || videoId !== currentVideoId) return;

    show('loading', null);

    const result = await chrome.runtime.sendMessage({ type: 'IDENTIFY_SONG', metadata });

    if (videoId !== currentVideoId) return; // navigated away while waiting

    if (result?.found) {
      show('found', result.track);
    } else {
      hide();
    }
  }

  // ─── Navigation detection ─────────────────────────────────────────────────

  function onNavigate() {
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId || videoId === currentVideoId) return;

    currentVideoId = videoId;
    hide();

    // Delay to let the DOM settle after YouTube's SPA navigation
    sleep(1800).then(() => identifyVideo(videoId));
  }

  document.addEventListener('yt-navigate-finish', onNavigate);

  // Handle hard page loads (direct URL or refresh)
  const initialId = new URLSearchParams(location.search).get('v');
  if (initialId) {
    currentVideoId = initialId;
    sleep(2200).then(() => identifyVideo(initialId));
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
})();
