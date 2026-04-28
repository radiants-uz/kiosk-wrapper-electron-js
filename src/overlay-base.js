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

  // Hidden force-update button at top-left, 100px below the zoom buttons.
  // Single tap triggers an immediate update check without waiting for the
  // 5-minute interval. Visitors won't see it (transparent + opacity 0); staff
  // know where to tap.
  const updateBtn = document.createElement("button");
  updateBtn.innerHTML = "Update";
  updateBtn.style.cssText = `
    position: fixed;
    top: 100px;
    left: 20px;
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
  updateBtn.addEventListener("click", (e) => {
    e.preventDefault();
    send(IPC.CHECK_UPDATE);
  });
  updateBtn.addEventListener("contextmenu", (e) => e.preventDefault());

  document.body.appendChild(zoomIn);
  document.body.appendChild(zoomOut);
  document.body.appendChild(exitBtn);
  document.body.appendChild(updateBtn);

  // Three-finger swipe exit gesture for touch panels. Three simultaneous
  // touches dragging right, up, or left by >=150px sends REQUEST_EXIT.
  // Visitors won't accidentally trigger this; staff use it as an alternative
  // to the 5-second corner-hold. "Down" is intentionally NOT a trigger so
  // it doesn't conflict with normal scroll-style gestures.
  const SWIPE_THRESHOLD_PX = 150;
  let swipeStart = null;

  const onTouchStart = (e) => {
    if (e.touches.length !== 3) {
      swipeStart = null;
      return;
    }
    swipeStart = Array.from(e.touches).map((t) => ({
      x: t.clientX,
      y: t.clientY,
    }));
  };

  const onTouchMove = (e) => {
    if (!swipeStart || e.touches.length !== 3) return;
    const current = Array.from(e.touches);
    let dxSum = 0;
    let dySum = 0;
    for (let i = 0; i < 3; i++) {
      dxSum += current[i].clientX - swipeStart[i].x;
      dySum += current[i].clientY - swipeStart[i].y;
    }
    const dx = dxSum / 3;
    const dy = dySum / 3;
    const right = dx > SWIPE_THRESHOLD_PX;
    const left = dx < -SWIPE_THRESHOLD_PX;
    const up = dy < -SWIPE_THRESHOLD_PX;
    if (right || left || up) {
      swipeStart = null;
      send(IPC.REQUEST_EXIT);
    }
  };

  const resetSwipe = () => {
    swipeStart = null;
  };

  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", resetSwipe, { passive: true });
  window.addEventListener("touchcancel", resetSwipe, { passive: true });

  // Bottom-right version label - lets a tech support person glance at a
  // kiosk screen and know which build is running. pointer-events:none so it
  // never intercepts clicks on the underlying website.
  const versionLabel = document.createElement("div");
  versionLabel.textContent = "v" + (window.__APP_VERSION || "?");
  versionLabel.style.cssText = `
    position: fixed;
    bottom: 8px;
    right: 12px;
    z-index: 999999;
    color: rgba(255, 255, 255, 0.4);
    font-size: 11px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  `;
  document.body.appendChild(versionLabel);
})();
