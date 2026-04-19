const extensionId = chrome.runtime.id;

// Read the bundled host.py source to embed it in the install script
async function getHostSource() {
  const url = chrome.runtime.getURL('native-host/host.py');
  const res = await fetch(url);
  return res.text();
}

function generateInstallScript(hostSource, extId) {
  // Escape single quotes in the Python source for the heredoc
  const escaped = hostSource.replace(/'/g, "'\"'\"'");
  return `#!/bin/bash
set -e

HOST_DIR="$HOME/.pluck"
CHROME_HOSTS="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
BRAVE_HOSTS="$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
EDGE_HOSTS="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"

mkdir -p "$HOST_DIR"
mkdir -p "$CHROME_HOSTS"

# Write the native host script
cat > "$HOST_DIR/host.py" << 'PYEOF'
${escaped}
PYEOF
chmod +x "$HOST_DIR/host.py"

# Write the manifest for Chrome (and Chromium-based browsers)
MANIFEST='{
  "name": "com.pluck.host",
  "description": "Pluck native messaging host",
  "path": "'"$HOST_DIR/host.py"'",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${extId}/"]
}'

echo "$MANIFEST" > "$CHROME_HOSTS/com.pluck.host.json"

# Also install for Brave and Edge if present
[ -d "$BRAVE_HOSTS" ] && echo "$MANIFEST" > "$BRAVE_HOSTS/com.pluck.host.json"
[ -d "$EDGE_HOSTS"  ] && echo "$MANIFEST" > "$EDGE_HOSTS/com.pluck.host.json"

echo ""
echo "✓ Pluck native host installed."
echo "  → Go to chrome://extensions and click the reload icon on Pluck."
echo ""
`;
}

async function checkNativeHost() {
  return new Promise(resolve => {
    chrome.runtime.sendNativeMessage('com.pluck.host', { type: 'PING' }, response => {
      resolve(!chrome.runtime.lastError && response?.ok === true);
    });
  });
}

async function init() {
  const installed = await checkNativeHost();

  if (installed) {
    document.getElementById('status-native').classList.remove('hidden');
  } else {
    document.getElementById('status-browser').classList.remove('hidden');
    document.getElementById('setup-section').classList.remove('hidden');
  }

  document.getElementById('download-btn').addEventListener('click', async () => {
    const source = await getHostSource();
    const script = generateInstallScript(source, extensionId);
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: 'pluck-install.sh' });
    URL.revokeObjectURL(url);
  });
}

init();
