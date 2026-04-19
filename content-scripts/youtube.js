// PluckExtractor is injected before this file via manifest content_scripts order.

(function () {
  'use strict';

  // Defined first — const is NOT hoisted, placing it at the bottom caused a ReferenceError.
  const sleep = ms => new Promise(r => setTimeout(r, ms));

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
          <div class="pluck-title">Identifying…</div>
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
    el.className = ''; // visible

    if (track) {
      el.querySelector('.pluck-art').src = track.artworkUrl100?.replace('100x100', '60x60') ?? '';
      el.querySelector('.pluck-title').textContent = track.trackName ?? '';
      el.querySelector('.pluck-artist').textContent = track.artistName ?? '';
      el._track = track;
    } else if (state === 'loading') {
      el.querySelector('.pluck-art').src = '';
      el.querySelector('.pluck-title').textContent = 'Identifying…';
      el.querySelector('.pluck-artist').textContent = '';
      el._track = null;
    } else if (state === 'not-found') {
      el.querySelector('.pluck-art').src = '';
      el.querySelector('.pluck-title').textContent = 'No match found';
      el.querySelector('.pluck-artist').textContent = '';
      el._track = null;
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

    show('loading', null);

    // Layer 1: YouTube Content ID "Music in this video" DOM section
    let metadata = PluckExtractor.fromContentID();

    // Layer 2: ytInitialPlayerResponse via injected page-context script
    if (!metadata) {
      const pageData = await PluckExtractor.fromPageData();
      if (pageData?.rawTitle) {
        metadata = pageData.category === 'Music'
          ? (PluckExtractor.fromTitle(pageData.rawTitle) ?? { rawTitle: pageData.rawTitle })
          : PluckExtractor.fromTitle(pageData.rawTitle);
      }
    }

    // Layer 3: visible h1 title on the page
    if (!metadata) {
      const titleEl = document.querySelector([
        'ytd-watch-metadata h1 yt-formatted-string',
        '#above-the-fold #title h1 yt-formatted-string',
        'h1.ytd-video-primary-info-renderer yt-formatted-string',
        '#title h1',
      ].join(', '));
      const raw = titleEl?.textContent?.trim();
      if (raw) metadata = PluckExtractor.fromTitle(raw);
    }

    if (videoId !== currentVideoId) return;

    if (!metadata) {
      show('not-found', null);
      return;
    }

    const result = await Promise.race([
      chrome.runtime.sendMessage({ type: 'IDENTIFY_SONG', metadata }),
      sleep(12000).then(() => null),
    ]);

    if (videoId !== currentVideoId) return;

    if (result?.found) {
      show('found', result.track);
    } else {
      show('not-found', null);
    }
  }

  // ─── Navigation detection ─────────────────────────────────────────────────

  function onNavigate() {
    const videoId = new URLSearchParams(location.search).get('v');
    if (!videoId || videoId === currentVideoId) return;

    currentVideoId = videoId;
    hide();

    sleep(1800).then(() => identifyVideo(videoId));
  }

  document.addEventListener('yt-navigate-finish', onNavigate);

  // Hard page load — direct URL visit or refresh
  const initialId = new URLSearchParams(location.search).get('v');
  if (initialId) {
    currentVideoId = initialId;
    sleep(2200).then(() => identifyVideo(initialId));
  }

})();
