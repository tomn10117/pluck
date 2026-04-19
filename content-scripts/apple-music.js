// Runs on music.apple.com.
// Injects a bridge script into the page context to access MusicKit.getInstance(),
// then listens for ADD_SONG messages from the background service worker.

(function () {
  'use strict';

  // MusicKit lives in the page's JS context; content scripts run in an isolated world.
  // We inject a <script> tag once that sets up a postMessage bridge.
  function injectBridge() {
    if (document.getElementById('pluck-bridge')) return;
    const s = document.createElement('script');
    s.id = 'pluck-bridge';
    s.textContent = `
      window.addEventListener('message', async event => {
        if (event.source !== window) return;
        if (event.data?.type !== 'PLUCK_ADD_SONG') return;
        const { trackId, nonce } = event.data;
        try {
          const kit = MusicKit.getInstance();
          if (!kit.isAuthorized) await kit.authorize();
          // MusicKit v3 API
          await kit.api.music('/v1/me/library', undefined, {
            fetchOptions: {
              method: 'POST',
              body: JSON.stringify({ data: [{ id: trackId, type: 'songs' }] }),
            },
          });
          window.postMessage({ type: 'PLUCK_ADD_RESULT', nonce, success: true }, '*');
        } catch (e) {
          window.postMessage({ type: 'PLUCK_ADD_RESULT', nonce, success: false, error: e.message }, '*');
        }
      });
    `;
    document.head.appendChild(s);
  }

  function addSong(trackId) {
    return new Promise((resolve, reject) => {
      const nonce = Math.random().toString(36).slice(2);

      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('MusicKit response timeout'));
      }, 20000);

      function handler(event) {
        if (event.data?.type === 'PLUCK_ADD_RESULT' && event.data.nonce === nonce) {
          clearTimeout(timer);
          window.removeEventListener('message', handler);
          if (event.data.success) resolve({ success: true });
          else reject(new Error(event.data.error ?? 'Unknown MusicKit error'));
        }
      }

      window.addEventListener('message', handler);
      window.postMessage({ type: 'PLUCK_ADD_SONG', trackId, nonce }, '*');
    });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'ADD_SONG') {
      addSong(msg.trackId)
        .then(sendResponse)
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }
    if (msg.type === 'PING') {
      sendResponse({ ready: true });
    }
  });

  // Inject bridge once MusicKit is available on the page
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(injectBridge, 800));
  } else {
    setTimeout(injectBridge, 300);
  }
})();
