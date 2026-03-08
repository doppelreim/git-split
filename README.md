# GitSplit

Expense sharing for small groups, powered by git. No backend server — GitHub Actions is the backend, GitHub Pages is the frontend, and the git repo is the database.

See [docs/PROJECT.md](docs/PROJECT.md) for the full architecture and [docs/PLAN.md](docs/PLAN.md) for the implementation plan.

## Project Structure

```
proxy/server.js              CORS proxy (Node.js, run locally)
scripts/build.js             CI build script (zero npm deps, Node built-ins only)
src/
  app.js                     Client JS: setup flow + add-expense form
  manifest.json              PWA manifest
  lib/
    git.js                   isomorphic-git wrapper (clone/commit/push)
    expenses.js              Expense write operations via git
  vendor/
    isomorphic-git.js        Browser bundle (download manually, see below)
    lightning-fs.js           Browser bundle (download manually, see below)
data/expenses/               One JSON file per expense (committed by users)
dist/                        Generated output (deployed to gh-pages)
.github/workflows/build.yml  CI pipeline: build + deploy on push
```

## Setup

### 1. Vendor libraries

Download the browser bundles into `src/vendor/`:

```bash
curl -Lo src/vendor/isomorphic-git.js "https://unpkg.com/isomorphic-git/index.umd.min.js"
curl -Lo src/vendor/lightning-fs.js "https://unpkg.com/@nicolo-ribaudo/lightning-fs/dist/lightning-fs.min.js"
```

### 2. CORS proxy

The proxy is needed for the browser to push git commits to GitHub (GitHub doesn't serve CORS headers on git HTTP endpoints).

```bash
node proxy/server.js
# Listens on http://localhost:9999 by default
# Set PORT env var to change
```

### 3. Build the static site locally

```bash
node scripts/build.js
# Reads data/expenses/*.json → generates dist/index.html
```

### 4. GitHub setup (for deployment)

1. Fork/create the repo on GitHub
2. Enable GitHub Pages (source: `gh-pages` branch)
3. Enable GitHub Actions
4. Create a fine-grained PAT with Contents read/write scope for the repo
5. Share the Pages URL + PAT with your group

## How It Works

- **Reading** (viewing expenses, balances, settlements): just load the GitHub Pages URL. Pure HTML+CSS, no JS required.
- **Writing** (adding an expense): the browser clones the repo via isomorphic-git through the CORS proxy, writes a JSON file, commits, and pushes. GitHub Actions then rebuilds the static site.

## Development

Build the dev-container:
```bash
docker build --build-arg UID=$(id -u) --build-arg GID=$(id -g) -t git-split:devcontainer .
```

Run the dev-container:
```bash
docker run --rm -it \
  --volume "../claude/state:/home/developer/.claude" \
  --volume "../claude/claude.json:/home/developer/.claude.json" \
  --volume "../claude/bin/claude:/home/developer/.local/bin/claude:ro" \
  --volume ".:/home/developer/git-split" \
  --workdir "/home/developer/git-split" \
  claude-devcontainer claude
```
