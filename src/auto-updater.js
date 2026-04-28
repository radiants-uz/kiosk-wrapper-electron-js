// Auto-update flow for unattended museum kiosks.
//
// Design constraints (why this is more involved than `autoUpdater.checkForUpdatesAndNotify`):
//   * Never show dialogs - kiosks have no operator standing by.
//   * Never block startup or crash on a bad update server. Failures log + retry.
//   * Defer install to 03:00-05:00 local so a kiosk doesn't restart in front
//     of a museum visitor.
//   * Sleep-resistant scheduling: a single multi-hour setTimeout drifts
//     across OS hibernate, so a 5-minute watchdog re-evaluates the wall clock.
//   * Belt: autoInstallOnAppQuit catches the case where the PC reboots
//     before the watchdog fires.

const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const {
  UPDATE_CHECK_INITIAL_DELAY_MS,
  UPDATE_CHECK_INTERVAL_MS,
  INSTALL_WINDOW_START_HOUR,
  INSTALL_WINDOW_END_HOUR,
  INSTALL_WATCHDOG_INTERVAL_MS,
} = require("./constants");

let initialized = false;
let pollTimers = [];
let installWatchdogId = null;
let updateReady = false;

const fmtErr = (err) =>
  err ? String(err.stack || err.message || err) : "unknown";

function safeCheckForUpdates() {
  autoUpdater.checkForUpdates().catch((err) => {
    log.warn("[Updater] checkForUpdates failed (non-fatal):", fmtErr(err));
  });
}

function isInsideInstallWindow(date) {
  const h = date.getHours();
  return h >= INSTALL_WINDOW_START_HOUR && h < INSTALL_WINDOW_END_HOUR;
}

function startInstallWatchdog(requestQuit) {
  if (installWatchdogId) return;
  installWatchdogId = setInterval(() => {
    if (!updateReady) return;
    if (!isInsideInstallWindow(new Date())) return;
    log.info("[Updater] Inside install window, calling quitAndInstall.");
    requestQuit();
    // isSilent=true (no UI), isForceRunAfter=true (relaunch app post-install).
    autoUpdater.quitAndInstall(true, true);
  }, INSTALL_WATCHDOG_INTERVAL_MS);
}

function cleanup() {
  pollTimers.forEach((t) => {
    clearTimeout(t);
    clearInterval(t);
  });
  pollTimers = [];
  if (installWatchdogId) {
    clearInterval(installWatchdogId);
    installWatchdogId = null;
  }
}

function setup({ appVersion, isPackaged, requestQuit, logFileMaxBytes }) {
  if (initialized) {
    log.warn("[Updater] setup() called twice; ignoring.");
    return cleanup;
  }
  initialized = true;

  if (typeof logFileMaxBytes === "number") {
    log.transports.file.maxSize = logFileMaxBytes;
  }
  log.transports.file.level = "info";
  log.transports.console.level = "debug";

  if (!isPackaged) {
    log.info("[Updater] Skipped (running in dev mode).");
    return cleanup;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  log.info(`[App] v${appVersion} starting (auto-updater enabled).`);

  autoUpdater.on("checking-for-update", () => {
    log.info("[Updater] Checking for updates...");
  });
  autoUpdater.on("update-available", (info) => {
    log.info(`[Updater] Update available: v${info.version}`);
  });
  autoUpdater.on("update-not-available", (info) => {
    log.info(
      `[Updater] No update available (current: v${info && info.version}).`,
    );
  });
  autoUpdater.on("error", (err) => {
    log.warn("[Updater] Error (non-fatal):", fmtErr(err));
  });

  // Throttle: emit only when crossing each 10% boundary, so a multi-MB
  // update produces ~10 lines instead of hundreds.
  let lastLoggedTenth = -1;
  autoUpdater.on("download-progress", (p) => {
    const tenth = Math.floor(p.percent / 10);
    if (tenth === lastLoggedTenth) return;
    lastLoggedTenth = tenth;
    log.info(
      `[Updater] Download ${p.percent.toFixed(1)}% (${(
        p.bytesPerSecond / 1024
      ).toFixed(0)} KB/s)`,
    );
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info(
      `[Updater] Update v${info.version} downloaded - awaiting install window.`,
    );
    updateReady = true;
    startInstallWatchdog(requestQuit);
  });

  pollTimers.push(setTimeout(safeCheckForUpdates, UPDATE_CHECK_INITIAL_DELAY_MS));
  pollTimers.push(setInterval(safeCheckForUpdates, UPDATE_CHECK_INTERVAL_MS));

  return cleanup;
}

module.exports = { setup };
