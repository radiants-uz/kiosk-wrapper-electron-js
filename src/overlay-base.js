// Renderer overlay - mounted on every dom-ready via webContents.executeJavaScript.
// Runs with nodeIntegration:true so require('electron') is available here.
// IPC channel names come from window.__IPC, populated by main before injection.
// The IIFE flag makes re-injection on the same document a no-op.

(() => {
  if (window.__kioskButtonsInjected) return;
  window.__kioskButtonsInjected = true;

  const { ipcRenderer } = require("electron");
  const IPC = window.__IPC || {};
  const HOLD_MS = 5000;

  const send = (channel) => {
    try {
      ipcRenderer.send(channel);
    } catch (_) {
      // ipcRenderer may be undefined if nodeIntegration ever changes - swallow.
    }
  };

  const ZOOM_BUTTON_STYLE = `
    position: fixed;
    z-index: 999999;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.3);
    padding: 15px 25px;
    border-radius: 8px;
    font-size: 24px;
    font-weight: bold;
    cursor: pointer;
    opacity: 0;
    transition: all 0.3s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  `;

  function makeZoomButton(label, position, channel) {
    const b = document.createElement("button");
    b.innerHTML = label;
    b.style.cssText = ZOOM_BUTTON_STYLE + position;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      send(channel);
    });
    return b;
  }

  const zoomIn = makeZoomButton("+", "top: 20px; left: 20px;", IPC.ZOOM_IN);
  const zoomOut = makeZoomButton("−", "top: 20px; left: 90px;", IPC.ZOOM_OUT);

  // Invisible 90x90 hit area at top-right. Five-second hold sends REQUEST_EXIT.
  // Wired to mouse, touch, AND contextmenu so it works on desktops, touch
  // panels, and pen displays. The contextmenu preventDefault is essential -
  // without it, long-press on touchscreens would surface the OS menu mid-hold.
  const exitBtn = document.createElement("button");
  exitBtn.innerHTML = "Exit";
  exitBtn.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    background: transparent;
    color: transparent;
    border: none;
    padding: 30px 40px;
    border-radius: 5px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    opacity: 0;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  `;

  let holdTimer = null;
  let isHolding = false;

  const startHold = () => {
    if (isHolding) return;
    isHolding = true;
    holdTimer = setTimeout(() => send(IPC.REQUEST_EXIT), HOLD_MS);
  };
  const cancelHold = () => {
    isHolding = false;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const onPress = (e) => {
    e.preventDefault();
    startHold();
  };
  const onRelease = (e) => {
    e.preventDefault();
    cancelHold();
  };

  exitBtn.addEventListener("mousedown", onPress);
  exitBtn.addEventListener("mouseup", onRelease);
  exitBtn.addEventListener("mouseleave", onRelease);
  exitBtn.addEventListener("touchstart", onPress, { passive: false });
  exitBtn.addEventListener("touchend", onRelease, { passive: false });
  exitBtn.addEventListener("touchcancel", onRelease, { passive: false });
  exitBtn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    return false;
  });

  document.body.appendChild(zoomIn);
  document.body.appendChild(zoomOut);
  document.body.appendChild(exitBtn);
})();
