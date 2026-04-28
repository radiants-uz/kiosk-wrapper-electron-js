# Electron + Vite + React Integration

This project demonstrates how to run a Vite + React project inside an Electron application.

## Project Structure

- Root directory: Contains the Electron main process (`main.js`)
- `project/` directory: Contains the Vite + React application

## Setup

1. Install dependencies for both the root and project directories:
   ```bash
   npm install
   npm run install:project
   ```

## Development

To run the application in development mode (with hot reload):

```bash
npm run dev
```

This will:

- Start the Vite dev server on port 5173
- Launch Electron and load the Vite dev server
- Enable hot module replacement (HMR)

## Production Build

To build and run the application in production mode:

```bash
npm run build:electron
```

This will:

- Build the Vite project to `project/dist/`
- Launch Electron and load the built files

## Available Scripts

- `npm run dev` - Run in development mode with Vite dev server
- `npm run build` - Build the Vite project only
- `npm run build:electron` - Build and run in production mode
- `npm start` - Run Electron in production mode (requires built files)
- `npm run install:project` - Install dependencies in the project directory

## How It Works

The `main.js` file detects the environment:

- **Development**: Starts Vite dev server and loads `http://localhost:5173`
- **Production**: Loads the built files from `project/dist/index.html`

The Vite configuration is optimized for Electron with:

- `base: './'` for relative asset paths
- Proper build output configuration
- Fixed port for dev server
# electron-js-kiosk-mode
# kiosk-application-electron-js

---

## Auto-Updates (museum kiosk fleet)

The app uses [`electron-updater`](https://www.electron.build/auto-update) with the `github` provider, pulling updates from GitHub Releases of `radiants-uz/kiosk-wrapper-electron-js`. Update flow on each of the 20 kiosks:

1. App launches normally — never blocks on the update server.
2. ~30 seconds after launch and then **every 5 minutes**, it queries GitHub Releases for a newer version.
3. If a newer version exists, it's downloaded silently in the background.
4. The moment the download finishes, the kiosk **restarts and installs immediately** — no time-of-day wait. End-to-end from `git push --follow-tags` to "all kiosks running new version" takes roughly 5–10 minutes.
5. After install, the app relaunches automatically (the kiosk comes back up on its own).

> ⚠️ **Visible downtime trade-off:** because installs fire as soon as a release is downloaded, kiosks will restart in front of visitors when an update lands. Each restart is ~30 seconds of dark screen. If you need to schedule installs for off-hours, re-add a window check in [src/auto-updater.js](src/auto-updater.js) `update-downloaded` handler.

All update activity is logged to `%AppData%\Iccu Platform\logs\main.log` on Windows (`~/Library/Logs/Iccu Platform/main.log` on macOS). The log file rotates at 5 MB. Pull it remotely (TeamViewer / RDP / file share) to debug any update issue.

### Bumping the version and shipping a release

Releases are fully automated via GitHub Actions ([.github/workflows/release.yml](.github/workflows/release.yml)). You don't build on your own machine — you push a tag and CI does the rest.

From your local clone:

```bash
# 1. Bump version (commits + tags in one step)
npm version patch          # 2.0.1 → 2.0.2  (or `minor` / `major`)

# 2. Push commit + tag
git push --follow-tags
```

That triggers the workflow, which on a Windows runner:
1. Checks the tag matches `package.json` version (fails fast if not)
2. Runs `npm ci`
3. Runs `electron-builder --win --publish always`
4. Creates a public release at `https://github.com/radiants-uz/kiosk-wrapper-electron-js/releases/tag/v2.0.2` with `Iccu Platform Setup 2.0.2.exe`, the `.blockmap`, and `latest.yml` attached

The 20 kiosks see the new release within 5 minutes, download in the background, and restart-to-install as soon as the download finishes.

**Watching a release:** https://github.com/radiants-uz/kiosk-wrapper-electron-js/actions — each tag push shows up as a workflow run. Build takes ~3–5 minutes.

**Re-running a failed release:** open the failed run in Actions and click "Re-run jobs", or use the "Run workflow" button on the workflow page (workflow_dispatch).

**Public vs private repo:** the repo is public, so kiosks need no token. If you ever flip it private, add a `GH_TOKEN` to each kiosk's environment or set a `token` field on the publish config (and rotate it).

### Testing on one kiosk before rolling out

Critical: never push an untested release to all 20 PCs.

1. Bump version to e.g. `2.0.2-test` and build.
2. Publish a release as above (mark as **pre-release** if you want to keep it out of "latest" — but note electron-updater with default settings only picks up non-prereleases unless `allowPrerelease` is set).
3. On ONE kiosk, tail the log:
   ```
   Get-Content "$env:APPDATA\Iccu Platform\logs\main.log" -Wait
   ```
4. Within ~30 seconds you should see `Checking for updates...`, then `Update available: v2.0.2-test`, then `Download …%` lines (one per 10% boundary), then `Update v2.0.2-test downloaded - installing now.` followed by an immediate restart.
5. After the kiosk restarts, the version label in the bottom-right corner should show `v2.0.2-test`.
6. Only after that one kiosk is healthy, leave the other 19 to pick up the update within their 5-minute interval.

### First-time deployment notes

- The currently deployed v2.0.1 builds were installed under `productName: history` and `appId: com.kiosk.secure-app`. The new build uses `Iccu Platform` / `iccu.museum.touchscreen`. **NSIS will treat this as a different application** — you'll need to manually uninstall the old "history" app and install the new "Iccu Platform" build once on each kiosk. From that point forward, all future updates are automatic.
- Auto-updates require the kiosk to run the app with permission to write to `Program Files` (per-machine install). If a kiosk runs as a limited user, `quitAndInstall` will silently fail — confirm via the log file.

## Project layout

```
main.js                  - Bootstrap, window creation, IPC, kiosk hardening
src/constants.js         - All magic numbers, IPC channels, app URL
src/auto-updater.js      - Self-contained electron-updater integration
src/overlay-base.js      - Renderer overlay: zoom + invisible exit button
src/overlay-offline.js   - Renderer overlay: try-again + restart-pc buttons
installer.nsh            - NSIS hook to taskkill running app before install
preload.js               - (currently unused; kept for future contextBridge migration)
index.html               - Local fallback shown when offline
```

# kiosk-wrapper-electron-js
# kiosk-wrapper-electron-js
