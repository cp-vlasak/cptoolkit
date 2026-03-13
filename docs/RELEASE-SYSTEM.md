# Release System — How It Works

## The Problem

Chrome doesn't let you install extensions with one click unless they're on the Chrome Web Store. Since this is an internal tool, we're not publishing it there. That means everyone has to manually download files, extract them, and "Load unpacked" in developer mode.

Without this system, distributing updates means messaging people a ZIP file and hoping they replace their old files. There's no way to know what version someone is running or tell them a new one is available.

## The Solution

This release system solves three things:

1. **Download page** — A simple webpage where anyone on the team can grab the latest version with one click
2. **Automated packaging** — When you tag a release, GitHub automatically builds the ZIP and publishes it
3. **Update notifications** — The extension popup tells users when a newer version exists

---

## How Each Piece Works

### 1. GitHub Actions Workflow (`.github/workflows/release.yml`)

**What it does:** Automatically packages the extension and creates a downloadable release on GitHub.

**How it triggers:** When you push a git tag that starts with `v` (e.g., `v1.3.0`), GitHub Actions runs this workflow. You can also trigger it manually from the Actions tab.

**What it does step by step:**
1. Checks out the repo
2. Reads the version from `manifest.json`
3. Zips up only the extension files (`manifest.json`, `css/`, `data/`, `html/`, `images/`, `js/`, `socials/`) — excludes dev files like `.github/`, `docs/`, `server/`, etc.
4. Creates a GitHub Release with the ZIP attached and install instructions in the description

**The ZIP is always named `mv3-toolkit.zip`** so the download URL never changes. The download page always points to `/releases/latest/download/mv3-toolkit.zip`, which automatically resolves to the most recent release.

### 2. Download Page (`docs/index.html`)

**What it does:** A hosted webpage where teammates can download the extension and see step-by-step install instructions.

**Where it lives:** GitHub Pages serves the `docs/` folder as a website. Once enabled, it's available at `https://<username>.github.io/<repo>/`.

**What's on the page:**
- A big "Download Latest Version" button that links to the latest release ZIP
- A version badge that auto-fetches the latest release tag from the GitHub API
- 6 numbered steps walking through the Chrome "Load unpacked" install process
- Instructions for updating to a new version (extract to same folder, hit refresh)

**No build step required** — it's a single self-contained HTML file with inline CSS and a small script for the version badge.

### 3. Update Checker (`js/popup.js` + `html/main.html`)

**What it does:** When a user opens the extension popup, it checks if a newer version has been released on GitHub. If so, it shows a blue banner at the top of the popup.

**How it works:**
1. Reads the local extension version from `manifest.json` via `chrome.runtime.getManifest().version`
2. Fetches the latest release from the GitHub API (`/repos/<owner>/<repo>/releases/latest`)
3. Compares the tag (e.g., `v1.3.0` → `1.3.0`) to the local version
4. If they don't match, shows: "Update available: v1.3.0 (you have v1.2.0). Click to download."
5. Clicking the banner opens the download page in a new tab

**Fails silently** — if the user is offline, rate-limited, or the API is down, nothing shows. No errors, no broken UI.

---

## Releasing a New Version

1. Update `version` in `mv3-extension/manifest.json` (e.g., `"1.3.0"`)
2. Commit and push to main
3. Tag and push:
   ```
   git tag v1.3.0
   git push origin v1.3.0
   ```
4. That's it — the workflow packages the ZIP, creates the release, and the download page + update checker automatically pick up the new version

---

## One-Time Setup

After merging this PR, you need to enable GitHub Pages:

1. Go to your repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main**, folder: **/docs**
4. Save

The page goes live in 1–2 minutes. After that, everything is automated.
