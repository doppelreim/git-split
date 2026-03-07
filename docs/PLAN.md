# Implementation Plan

## Overview

We build GitSplit in incremental phases. Each phase produces a working (if limited) prototype that can be tested end-to-end.

### Core Principle: Read vs Write Separation

- **Reading data** (expenses, balances, settlement plan) happens through the **built static site**. No git connection needed. Anyone with the URL can view the current state.
- **Writing data** (adding an expense) requires the git connection setup (proxy, PAT, repo URL). Only users who want to contribute data need this.

---

## Phase 1: Local CORS Proxy

A minimal HTTP proxy that forwards requests to GitHub's git HTTP endpoints and injects CORS headers.

### Tasks

1. **Simple Node.js proxy server**
   - Listens on a configurable local port (default: 9999)
   - Forwards all requests to `https://github.com/*`
   - Adds `Access-Control-Allow-Origin: *` and related CORS headers to responses
   - Handles OPTIONS preflight requests
   - Passes through Authorization headers (for PAT auth)
   - Minimal dependencies (just Node built-ins, or `http-proxy` if needed)

### Deliverable
- `proxy/server.js` - runnable with `node proxy/server.js`

---

## Phase 2: Git Operations Library

A thin wrapper around isomorphic-git that handles the clone-commit-push cycle from the browser.

Use vanilla JavaScript unless TypeScript adds negligible build complexity.

### Tasks

1. **Git client module**
   - Clone a repo (shallow, single branch) into an in-memory filesystem (using lightning-fs)
   - Write a file, stage it, and commit
   - Push to origin (with PAT-based HTTP auth via the CORS proxy)
   - Pull latest changes (fetch + merge/fast-forward)
   - Retry logic: if push fails (non-fast-forward), pull and retry

2. **Configuration**
   - Repo URL, branch, proxy URL, PAT, and user's display name stored in localStorage
   - Git module reads config from localStorage

### Deliverable
- `src/lib/git.js` - git operations module
- Can be tested standalone in a browser console

---

## Phase 3: Data Layer

Functions that write expense data using the git operations from Phase 2.

### Tasks

1. **Expense file management**
   - `addExpense(expense)` - writes a JSON file to `data/expenses/<id>.json`, commits, and pushes
   - No read/list/delete needed in the client - reading is done via the static site

### Deliverable
- `src/lib/expenses.js` - expense write operations via git

---

## Phase 4: GitHub Actions Workflow

The CI/CD pipeline that acts as the "backend." Moved up because it produces the data the frontend reads.

### Tasks

1. **Workflow trigger**
   - Trigger on push to `main` branch
   - Only run if files in `data/expenses/` changed

2. **Build step**
   - Check out the repo
   - Read all expense files from `data/expenses/`
   - Derive `group.json` automatically from participant names found in expense files (no manual editing)
   - Compute balances and settlement plan
   - Write results to `data/computed.json` (balances, settlement, expense summary)
   - Build the static site
   - Deploy to `gh-pages` branch

3. **`data/computed.json` structure** (written by the pipeline, read by the static site)
   ```json
   {
     "participants": ["Alice", "Bob", "Charlie"],
     "currency": "EUR",
     "expenses": [
       {
         "id": "...",
         "description": "Dinner",
         "amount": 84.50,
         "paidBy": "Alice",
         "splitBetween": ["Alice", "Bob", "Charlie"],
         "date": "2026-03-06"
       }
     ],
     "balances": {
       "Alice": 56.33,
       "Bob": -28.17,
       "Charlie": -28.17
     },
     "settlements": [
       { "from": "Bob", "to": "Alice", "amount": 28.17 },
       { "from": "Charlie", "to": "Alice", "amount": 28.17 }
     ]
   }
   ```

### Deliverable
- `.github/workflows/build.yml`
- `scripts/compute.js` - the build script that reads expenses and produces `computed.json`

---

## Phase 5: Static Web App (Frontend)

A minimal single-page app. The site reads `computed.json` to display data. Git operations are only needed for the "add expense" flow.

### Tasks

1. **Read-only view (default, no setup needed)**
   - Fetches `computed.json` from the same origin (GitHub Pages)
   - Displays list of expenses
   - Displays net balances per person
   - Displays settlement plan (who pays whom how much)

2. **Write setup** (only when user wants to add an expense)
   - "Add Expense" button opens a setup prompt if git connection is not yet configured
   - Input fields: repo URL, PAT, proxy URL, user's display name
   - "Save & Connect" verifies the config works (attempts a clone)
   - Config stored in localStorage; setup is one-time per browser

3. **Add Expense form**
   - Fields: description, amount, paid by (text input or dropdown populated from `computed.json` participants), split between (checkboxes from participants, option to add new name)
   - Single currency (configured once per group, stored in the repo or inferred)
   - On submit: creates expense JSON file, commits, pushes
   - Success message with note that it takes a minute or two for the site to update

4. **No manual sync needed for reading**
   - Reading is just loading the page (which serves the latest built `computed.json`)
   - A simple page refresh shows the latest data after Actions has rebuilt

### Deliverable
- `src/` directory with the complete static web app
- Buildable into `dist/` for deployment to GitHub Pages

---

## Phase 6: End-to-End Testing & Polish

### Tasks

1. **Test the full cycle**
   - Start the proxy
   - Open the app, add an expense
   - Verify commit appears in the repo
   - Verify Actions runs and Pages updates with new data

2. **Error handling**
   - Network errors during push
   - Push conflict (concurrent edit) - pull and retry
   - Invalid/missing configuration

3. **UX polish**
   - Loading indicator during git operations
   - Success/error feedback after push
   - Responsive layout for mobile use

---

## Future Phases (Out of Scope for Prototype)

- **Cloudflare Worker proxy** - source code + deployment docs for users to self-host
- **Android companion app** - acts as a CORS proxy on the device
- **Expense deletion/editing**
- **Multi-currency support**
- **Smarter settlement algorithm** (minimize number of transactions)

---

## Tech Stack

| Component          | Technology                          |
|--------------------|-------------------------------------|
| Frontend           | Vanilla JS (or Preact if warranted) |
| Git operations     | isomorphic-git + lightning-fs       |
| CORS proxy (dev)   | Node.js                            |
| CI/CD              | GitHub Actions                     |
| Hosting            | GitHub Pages                       |
| Build tool         | Vite (if needed) or plain HTML/JS  |

The choice of vanilla JS vs Preact, and whether we need Vite, will be decided when starting Phase 5. For the prototype, simplicity wins.

---

## File Structure (Projected)

```
crud-aa-cicd/
  proxy/
    server.js                # Local CORS proxy
  scripts/
    compute.js               # Build script: reads expenses, writes computed.json
  src/
    lib/
      git.js                 # isomorphic-git wrapper
      expenses.js            # Expense write operations
    app.js                   # Main app entry point
    index.html               # Entry HTML
  data/
    expenses/                # One JSON file per expense (committed by users)
    computed.json            # Generated by CI pipeline (balances, settlements)
  .github/
    workflows/
      build.yml              # GitHub Actions workflow
  docs/
    PROJECT.md
    PLAN.md
  package.json
```

---

## Suggested Order of Work

**Phase 1 + 2** together (proxy + git library) - first milestone: push a commit from the browser.
Then **Phase 3** (expense data layer) - push a properly formatted expense file.
Then **Phase 4** (GitHub Actions) - expenses get processed into `computed.json`.
Then **Phase 5** (frontend) - the full UI reading computed data and writing expenses.
Phase 6 ongoing throughout.

---

## Decisions Made

- Single currency only for the prototype.
- No expense deletion or editing in the prototype.
- No manual group management - participants are derived from expense data by the pipeline.
- No client-side balance calculation - all computation happens in the pipeline, results served via `computed.json`.
- Git connection (proxy + PAT) is only needed for writing. Reading is just loading the static site.
- Vanilla JS unless TypeScript/framework complexity is negligible.
