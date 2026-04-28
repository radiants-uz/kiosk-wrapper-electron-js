// Renderer overlay for offline mode - mounted only when the external URL
// failed to load and the local fallback is showing. Visible buttons (opacity
// 1) since the user needs a way to retry or restart the kiosk.

(() => {
  if (window.__kioskOfflineButtonsInjected) return;
  window.__kioskOfflineButtonsInjected = true;

  const { ipcRenderer } = require("electron");
  const IPC = window.__IPC || {};

  const send = (channel) => {
    try {
      ipcRenderer.send(channel);
    } catch (_) {}
  };

  function makeOfflineButton({ html, top, baseColor, hoverColor, channel }) {
    const b = document.createElement("button");
    b.innerHTML = html;
    b.style.cssText = `
      position: fixed;
      top: ${top};
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 999999;
      background: ${baseColor};
      color: white;
      border: 2px solid rgba(255, 255, 255, 0.5);
      padding: 20px 40px;
      border-radius: 12px;
      font-size: 20px;
      font-weight: bold;
      cursor: pointer;
      opacity: 1;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
    `;
    const hoverIn = () => {
      b.style.background = hoverColor;
      b.style.transform = "translate(-50%, -50%) scale(1.05)";
    };
    const hoverOut = () => {
      b.style.background = baseColor;
      b.style.transform = "translate(-50%, -50%) scale(1)";
    };
    b.addEventListener("mouseenter", hoverIn);
    b.addEventListener("mouseleave", hoverOut);
    b.addEventListener("touchstart", hoverIn, { passive: true });
    b.addEventListener("touchend", hoverOut, { passive: true });
    b.addEventListener("click", (e) => {
      e.preventDefault();
      send(channel);
    });
    return b;
  }

  document.body.appendChild(
    makeOfflineButton({
      html: "🔄 Try Again",
      top: "50%",
      baseColor: "rgba(0, 120, 255, 0.9)",
      hoverColor: "rgba(0, 140, 255, 0.95)",
      channel: IPC.TRY_AGAIN,
    }),
  );

  document.body.appendChild(
    makeOfflineButton({
      html: "🔄 Restart PC",
      top: "60%",
      baseColor: "rgba(255, 87, 34, 0.9)",
      hoverColor: "rgba(255, 107, 54, 0.95)",
      channel: IPC.RESTART_PC,
    }),
  );
})();
