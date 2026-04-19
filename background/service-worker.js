import { searchAppleMusic } from '../utils/itunes-search.js';

const NATIVE_HOST = 'com.pluck.host';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'IDENTIFY_SONG') {
    identifySong(msg.metadata)
      .then(sendResponse)
      .catch(() => sendResponse({ found: false }));
    return true;
  }

  if (msg.type === 'ADD_TO_LIBRARY') {
    addToLibrary(msg.track)
      .then(sendResponse)
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

async function identifySong(metadata) {
  if (metadata.artist && metadata.title) {
    const track = await searchAppleMusic(metadata.artist, metadata.title);
    if (track) return { found: true, track };
  }

  if (metadata.rawTitle) {
    const track = await searchAppleMusic(null, metadata.rawTitle);
    if (track) return { found: true, track };
  }

  // TODO: AudD audio fingerprint fallback
  return { found: false };
}

async function addToLibrary(track) {
  // Prefer native Music app if the host is installed
  try {
    const result = await sendNativeMessage({ type: 'ADD_SONG', ...track });
    if (result?.success) return { success: true };
  } catch (_) {
    // Host not installed — fall through to browser fallback
  }

  return addViaBrowser(track);
}

// ─── Native messaging ─────────────────────────────────────────────────────

function sendNativeMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, msg, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ─── Browser fallback (music.apple.com) ──────────────────────────────────

async function addViaBrowser(track) {
  const existing = await chrome.tabs.query({ url: '*://music.apple.com/*' });

  let tab;
  let openedTab = false;

  if (existing.length > 0) {
    tab = existing[0];
  } else {
    tab = await chrome.tabs.create({ url: 'https://music.apple.com', active: false });
    openedTab = true;
    await waitForTabLoad(tab.id);
    await sleep(800);
  }

  try {
    return await sendMessageWithRetry(tab.id, { type: 'ADD_SONG', trackId: String(track.trackId) }, 3);
  } finally {
    if (openedTab) {
      await sleep(1000);
      chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function sendMessageWithRetry(tabId, msg, retries) {
  for (let i = 0; i < retries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1000);
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
