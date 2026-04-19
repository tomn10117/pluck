#!/usr/bin/env python3
"""
Pluck native messaging host.
Receives a track from the Chrome extension and adds it to the native Music app
via AppleScript UI automation. Requires Accessibility permission for Music.app.
"""

import sys
import json
import struct
import subprocess
import time


def read_msg():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        sys.exit(0)
    length = struct.unpack('I', raw)[0]
    return json.loads(sys.stdin.buffer.read(length).decode('utf-8'))


def send_msg(obj):
    data = json.dumps(obj).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('I', len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def add_to_library(track):
    url = track.get('trackViewUrl', '')
    if not url:
        return False, 'No trackViewUrl'

    # Convert https:// Apple Music URL to music:// so the OS opens it in Music.app
    music_url = url.replace('https://', 'music://')

    # Open in Music.app
    subprocess.run(['open', '-a', 'Music', music_url], check=True)
    time.sleep(2.5)

    # AppleScript: activate Music, then find and click the Add to Library button.
    # The button appears in the song detail view after opening via URL.
    script = '''
tell application "Music" to activate
delay 1.0
tell application "System Events"
    tell process "Music"
        set frontmost to true
        delay 0.5
        -- Walk all buttons in the main window looking for one that adds to library
        try
            set win to window 1
            set allBtns to every button of win
            repeat with btn in allBtns
                try
                    set d to description of btn
                    if d contains "Add" or d contains "Library" then
                        click btn
                        return "clicked:" & d
                    end if
                end try
            end repeat
        end try
        -- Fallback: try toolbar buttons
        try
            set allBtns to every button of toolbar 1 of window 1
            repeat with btn in allBtns
                try
                    set d to description of btn
                    if d contains "Add" or d contains "Library" then
                        click btn
                        return "clicked toolbar:" & d
                    end if
                end try
            end repeat
        end try
    end tell
end tell
return "not found"
'''
    result = subprocess.run(
        ['osascript', '-e', script],
        capture_output=True, text=True, timeout=15
    )
    output = result.stdout.strip()
    return 'clicked' in output, output or result.stderr.strip()


try:
    msg = read_msg()

    if msg.get('type') == 'PING':
        send_msg({'ok': True})

    elif msg.get('type') == 'ADD_SONG':
        success, detail = add_to_library(msg)
        send_msg({'success': success, 'detail': detail})

    else:
        send_msg({'success': False, 'error': 'Unknown message type'})

except Exception as e:
    send_msg({'success': False, 'error': str(e)})
