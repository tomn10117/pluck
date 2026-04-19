// Audio fingerprinting fallback via AudD API (https://audd.io)
// Handles cases where video title gives no usable metadata (e.g. Vietnamese reuploads).
//
// MV3 requires an offscreen document for tab audio capture since service workers
// have no access to MediaStream APIs. That wiring lives here when implemented.
//
// API key stored in: chrome.storage.local → { auddApiKey: '...' }

export async function identifyFromTab(tabId) {
  const { auddApiKey } = await chrome.storage.local.get('auddApiKey');
  if (!auddApiKey) throw new Error('No AudD API key configured');

  // Step 1: get a stream ID from the service worker (only place chrome.tabCapture works in MV3)
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

  // Step 2: record audio in an offscreen document and send to AudD
  // TODO: create offscreen document, pass streamId, capture 5s, POST to AudD
  // Reference: https://developer.chrome.com/docs/extensions/reference/api/offscreen
  throw new Error('AudD offscreen audio capture not yet implemented');
}
