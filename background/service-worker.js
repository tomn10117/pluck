import { searchAppleMusic } from '../utils/itunes-search.js';

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
  // Try with extracted artist + title first (most accurate)
  if (metadata.artist && metadata.title) {
    const track = await searchAppleMusic(metadata.artist, metadata.title);
    if (track) return { found: true, track };
  }

  // Try with just the cleaned raw title
  if (metadata.rawTitle) {
    const track = await searchAppleMusic(null, metadata.rawTitle);
    if (track) return { found: true, track };
  }

  // TODO: AudD audio fingerprint fallback (handles Vietnamese reuploads, unlabeled videos)
  // const { identifyFromTab } = await import('../utils/audd.js');
  // const track = await identifyFromTab(sender.tab.id);
  // if (track) return { found: true, track };

  return { found: false };
}

async function addToLibrary(track) {
  const existing = await chrome.tabs.query({ url: '*://music.apple.com/*' });

  let tab;
  let openedTab = false;

  if (existing.length > 0) {
    tab = existing[0];
  } else {
    tab = await chrome.tabs.create({ url: 'https://music.apple.com', active: false });
    openedTab = true;
    await waitForTabLoad(tab.id);
    await sleep(800); // let content script initialize
  }

  try {
    const result = await sendMessageWithRetry(tab.id, { type: 'ADD_SONG', trackId: String(track.trackId) }, 3);
    return result;
  } finally {
    if (openedTab) {
      await sleep(1000);
      chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

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
