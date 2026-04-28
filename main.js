const {
  app,
  BrowserWindow,
  systemPreferences,
  ipcMain,
  net,
  globalShortcut,
  Menu,
} = require("electron");
const path = require("path");
const fs = require("fs");

// Route every console.* call through electron-log so the existing console
// statements scattered through the code survive into the rotating log file.
// Without this, packaged Windows builds have no console window, and any
// `console.log` is invisible.
const log = require("electron-log");
Object.assign(console, log.functions);

const autoUpdaterModule = require("./src/auto-updater");
const {
  APP_URL,
  ALLOWED_HOSTNAMES,
  IPC,
  ONLINE_RETRY_INTERVAL_MS,
  DEFAULT_ZOOM_FACTOR,
  LOG_FILE_MAX_BYTES,
} = require("./src/constants");

const OFFLINE_FALLBACK_PATH = path.join(__dirname, "index.html");
// Read the renderer overlay scripts once at startup. Both files live as
// proper standalone JS (linted, syntax-highlighted) and are injected into
// the renderer via webContents.executeJavaScript on every dom-ready.
const OVERLAY_BASE_JS = fs.readFileSync(
  path.join(__dirname, "src", "overlay-base.js"),
  "utf8",
);
const OVERLAY_OFFLINE_JS = fs.readFileSync(
  path.join(__dirname, "src", "overlay-offline.js"),
  "utf8",
);
// Preamble exposes IPC channel constants and the app version to the overlay
// scripts so renderer code never hard-codes them.
function buildOverlayPreamble() {
  return (
    `window.__IPC = ${JSON.stringify(IPC)};` +
    `window.__APP_VERSION = ${JSON.stringify(app.getVersion())};`
  );
}

let mainWindow = null;
let isExiting = false;
let isOfflineMode = false;
let retryIntervalId = null;
let updaterCleanup = null;

// Single mutator for the kiosk close-handler's exit guard. Both the IPC
// exit path and the auto-updater's quitAndInstall need to flip this before
// triggering app.quit, so a named helper makes the intent obvious.
//hello world
function requestKioskQuit() {
  isExiting = true;
}

app.commandLine.appendSwitch("enable-features", "MediaStreamTrack");
app.commandLine.appendSwitch("disable-features", "OutOfBlinkCors");

// Strip the application menu globally. On Windows/Linux this removes the
// menu bar entirely; on every platform it kills menu-accelerator keys (Alt
// to focus the menu, F10 to open it) so a USB keyboard can't reach a menu.
Menu.setApplicationMenu(null);

async function checkMicrophonePermission() {
  if (process.platform !== "darwin") return true;
  const status = systemPreferences.getMediaAccessStatus("microphone");
  console.log("Microphone permission status:", status);
  if (status === "not-determined") {
    return systemPreferences.askForMediaAccess("microphone");
  }
  return status === "granted";
}

function injectOverlay(webContents, includeOffline) {
  const script =
    buildOverlayPreamble() +
    OVERLAY_BASE_JS +
    (includeOffline ? OVERLAY_OFFLINE_JS : "");
  webContents.executeJavaScript(script).catch((err) => {
    console.warn("Overlay injection failed:", err && err.message);
  });
}

function startOnlineRetryLoop() {
  if (retryIntervalId !== null) return;
  retryIntervalId = setInterval(async () => {
    try {
      if (!net.isOnline() || !mainWindow) return;
      console.log("Network detected, reloading external URL.");
      await mainWindow.loadURL(APP_URL);
      isOfflineMode = false;
      clearInterval(retryIntervalId);
      retryIntervalId = null;
    } catch (_) {
      // Stay offline, keep trying.
    }
  }, ONLINE_RETRY_INTERVAL_MS);
}

async function loadApp() {
  try {
    if (!net.isOnline()) throw new Error("No internet connection");
    await mainWindow.loadURL(APP_URL);
    isOfflineMode = false;
  } catch (error) {
    console.log("Offline, showing local fallback:", error.message);
    isOfflineMode = true;
    await mainWindow.loadFile(OFFLINE_FALLBACK_PATH);
    startOnlineRetryLoop();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: true,
    kiosk: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      devTools: true,
    },
  });

  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      if (
        permission !== "media" &&
        permission !== "audioCapture" &&
        permission !== "microphone"
      ) {
        return callback(false);
      }
      try {
        const requesting = new URL(details.requestingUrl || "");
        callback(ALLOWED_HOSTNAMES.has(requesting.hostname));
      } catch (_) {
        callback(false);
      }
    },
  );

  // Re-inject overlay buttons on every dom-ready - covers the initial load,
  // the offline fallback, and any "Try Again" reload. The renderer scripts
  // are idempotent so re-running on the same document is a no-op.
  mainWindow.webContents.on("dom-ready", async () => {
    try {
      await mainWindow.webContents.setZoomFactor(DEFAULT_ZOOM_FACTOR);
    } catch (e) {
      console.error("Failed to set zoom factor:", e);
    }
    injectOverlay(mainWindow.webContents, isOfflineMode);
  });

  // Block off-domain navigation, popups, downloads, context menus.
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    try {
      const target = new URL(navigationUrl);
      if (!ALLOWED_HOSTNAMES.has(target.hostname)) event.preventDefault();
    } catch (_) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.session.on("will-download", (event) =>
    event.preventDefault(),
  );
  mainWindow.webContents.on("context-menu", (event) => event.preventDefault());

  mainWindow.on("close", (event) => {
    if (!isExiting) event.preventDefault();
  });

  mainWindow.webContents.on("before-input-event", handleKeyDown);

  loadApp();
}

// Touch-only kiosk: block every key event except a single hidden support
// escape hatch (Ctrl/Cmd+Shift+C toggles DevTools). Visitors won't discover
// the combo, but an on-site tech can plug in a USB keyboard to debug.
function handleKeyDown(event, input) {
  if (input.type !== "keyDown") return;

  if (input.shift && (input.control || input.meta) && /^c$/i.test(input.key)) {
    mainWindow.webContents.toggleDevTools();
    event.preventDefault();
    return;
  }

  event.preventDefault();
}

function registerIpcHandlers() {
  ipcMain.on(IPC.REQUEST_EXIT, () => {
    requestKioskQuit();
    if (mainWindow) mainWindow.close();
  });

  ipcMain.on(IPC.ZOOM_IN, () => {
    if (!mainWindow) return;
    const z = Math.min(mainWindow.webContents.getZoomFactor() + 0.1, 2.0);
    mainWindow.webContents.setZoomFactor(z);
  });

  ipcMain.on(IPC.ZOOM_OUT, () => {
    if (!mainWindow) return;
    const z = Math.max(mainWindow.webContents.getZoomFactor() - 0.1, 0.5);
    mainWindow.webContents.setZoomFactor(z);
  });

  ipcMain.on(IPC.TRY_AGAIN, async () => {
    if (!mainWindow || !net.isOnline()) {
      console.log("Try-again: still offline.");
      return;
    }
    try {
      await mainWindow.loadURL(APP_URL);
      isOfflineMode = false;
    } catch (err) {
      console.log("Try-again failed:", err && err.message);
    }
  });

  ipcMain.on(IPC.RESTART_PC, () => {
    requestKioskQuit();
    runRestartCommand();
    setTimeout(() => app.quit(), 1000);
  });
}

// Best-effort lockdown of Windows-key combinations from inside the app.
// IMPORTANT: the bare Win key (no combo) is reserved by the OS shell and
// CANNOT be blocked from userspace - that requires either Group Policy or
// a Scancode Map registry entry on each kiosk PC. See README.
function blockWindowsKeyShortcuts() {
  if (process.platform !== "win32") return;
  const combos = [
    "Super+R", // Run dialog
    "Super+E", // File Explorer
    "Super+I", // Settings
    "Super+S", // Search
    "Super+D", // Show desktop
    "Super+L", // Lock screen (often intercepted by OS first)
    "Super+Tab", // Task view
    "Super+Up",
    "Super+Down",
    "Super+Left",
    "Super+Right",
    "Alt+F4",
  ];
  combos.forEach((combo) => {
    try {
      globalShortcut.register(combo, () => {});
    } catch (e) {
      console.warn("Could not register block for", combo, e && e.message);
    }
  });
}

function runRestartCommand() {
  const { exec } = require("child_process");

  if (process.platform === "win32") {
    exec("shutdown /r /t 0", (err) => {
      if (err) console.error("Failed to restart Windows:", err);
    });
    return;
  }

  if (process.platform === "darwin") {
    // AppleScript with admin privileges so the GUI prompt appears - shutting
    // down via raw `shutdown -r now` requires a TTY which we don't have.
    const apple =
      'do shell script "shutdown -r now" with administrator privileges';
    exec(`osascript -e '${apple}'`, (err, _stdout, stderr) => {
      if (!err) return;
      console.error("macOS restart via AppleScript failed:", err, stderr);
      exec(
        `osascript -e 'tell application "System Events" to restart'`,
        (fb) => {
          if (fb) console.error("macOS restart fallback failed:", fb);
        },
      );
    });
    return;
  }

  if (process.platform === "linux") {
    const cmd =
      "pkexec /usr/sbin/reboot || pkexec reboot || systemctl reboot || reboot";
    exec(cmd, (err, _stdout, stderr) => {
      if (err) console.error("Failed to restart Linux:", err, stderr);
    });
  }
}

app.whenReady().then(async () => {
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: false,
    args: [],
  });

  // app.dock only exists on darwin, so this hides the dock there and is a
  // no-op everywhere else - kiosk:true already hides the menu bar but the
  // dock can still slip back in on aggressive mouse-to-bottom.
  if (app.dock) app.dock.hide();

  await checkMicrophonePermission();
  createWindow();
  registerIpcHandlers();
  blockWindowsKeyShortcuts();

  updaterCleanup = autoUpdaterModule.setup({
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    requestQuit: requestKioskQuit,
    logFileMaxBytes: LOG_FILE_MAX_BYTES,
  });
});

app.on("before-quit", (event) => {
  if (!isExiting) {
    event.preventDefault();
    return;
  }
  // Sanctioned exit path - clear all timers so we don't leak across the
  // quitAndInstall/restart transition.
  if (retryIntervalId) {
    clearInterval(retryIntervalId);
    retryIntervalId = null;
  }
  if (typeof updaterCleanup === "function") updaterCleanup();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (isExiting || process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
