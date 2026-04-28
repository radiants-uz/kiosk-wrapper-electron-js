// Centralized constants for the kiosk app.
// Single source of truth for IPC channels, timing, and the app URL —
// touched by both the main process and the renderer overlay scripts.

const APP_URL = "https://lh.neovex.uz/";

// Derive the allowed-navigation hostname set from APP_URL so the
// will-navigate filter can never go stale when APP_URL changes.
const _hostname = new URL(APP_URL).hostname;
const _baseHost = _hostname.replace(/^www\./, "");
const ALLOWED_HOSTNAMES = new Set([_baseHost, `www.${_baseHost}`]);

const IPC = Object.freeze({
  REQUEST_EXIT: "request-exit",
  ZOOM_IN: "zoom-in",
  ZOOM_OUT: "zoom-out",
  TRY_AGAIN: "try-again",
  RESTART_PC: "restart-pc",
});

// Auto-update timing
const UPDATE_CHECK_INITIAL_DELAY_MS = 30 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Network retry loop while in offline-fallback mode
const ONLINE_RETRY_INTERVAL_MS = 30 * 1000;

// Renderer overlay defaults
const DEFAULT_ZOOM_FACTOR = 0.75;

// Cap rotating log file. Important for kiosks that run for months.
const LOG_FILE_MAX_BYTES = 5 * 1024 * 1024;

module.exports = {
  APP_URL,
  ALLOWED_HOSTNAMES,
  IPC,
  UPDATE_CHECK_INITIAL_DELAY_MS,
  UPDATE_CHECK_INTERVAL_MS,
  ONLINE_RETRY_INTERVAL_MS,
  DEFAULT_ZOOM_FACTOR,
  LOG_FILE_MAX_BYTES,
};
