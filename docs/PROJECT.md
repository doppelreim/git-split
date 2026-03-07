# GitSplit - Splitwise Clone Powered by Git CI/CD

## Vision

Hosting static sites is free and simple (GitHub Pages), but anything requiring a backend introduces complexity: cloud provider signups, infrastructure setup, unpredictable costs. This project explores using GitHub's free CI/CD pipelines as a substitute for a traditional backend server.

The result is a fully self-hosted, decentralized application where:
- The **frontend** is a completely static web page served via GitHub Pages (pure HTML+CSS for the read-only view)
- The **backend logic** runs inside GitHub Actions workflows, generating the static site with all data baked in
- The **database** is the git repository itself (JSON files in `data/expenses/`)
- There is **no central server** and **no dependency on a third party** beyond GitHub

Any person who wants their own instance simply forks the repo and gets a fully independent deployment.

## Architecture

```
User's Browser
    |
    | [READ] Load static page (pure HTML+CSS, no JS needed)
    |         All data pre-rendered at build time
    |
    | [WRITE] isomorphic-git (clone, commit, push over HTTP)
    |          Only needed when adding an expense
    |
    v
CORS Proxy (local / Android companion app / self-hosted Cloudflare Worker)
    |
    v
GitHub Repository
    |
    | push triggers GitHub Actions
    v
GitHub Actions Workflow
    - reads all expense JSON files
    - computes balances and settlement plan
    - generates complete static HTML page with data baked in
    - deploys to gh-pages branch
    |
    v
GitHub Pages (serves the pre-rendered static site)
```

### Key Design Decisions

- **Fully static read-only view.** The CI pipeline generates a complete HTML page with all expense data, balances, and settlements rendered as HTML+CSS. No client-side JavaScript is needed to view data. No JSON files are fetched at runtime.
- **Zero-dependency CI build.** The build script (`scripts/build.js`) uses only Node.js built-ins (`fs`, `path`). Node 18+ is pre-installed on GitHub runners, so no `npm install` step is needed. This keeps the pipeline fast (~15-20s total).
- **No GitHub API usage.** All interaction with GitHub is via git-over-HTTP using isomorphic-git. This avoids requiring a registered GitHub OAuth app and keeps the system independent.
- **CORS proxy is user-controlled.** The proxy adds missing CORS headers to GitHub's HTTP git responses. It is never a shared/public service. Options:
  - Local proxy on the user's machine (development)
  - Android companion app acting as a proxy (mobile use)
  - Self-hosted Cloudflare Worker (tech-savvy users deploy their own)
- **Shared fine-grained Personal Access Token.** All participants in a group share a single PAT scoped to the specific repo (Contents: read/write only). The token is stored in each user's browser (localStorage). All commits appear under one GitHub account, but commit metadata can carry the actual author name.
- **Eventual consistency.** Changes are not instant. After a push, GitHub Actions takes 15s-2min to rebuild. Users refresh to see updates. This is acceptable for the target use case.

## Application: GitSplit

A splitwise-style expense tracker for small groups:
- Participants add shared expenses (who paid, how much, who was involved)
- The CI pipeline calculates the net balances (who owes whom) and generates the settlement plan
- The complete results are rendered as a static HTML page

### How It Works (User Perspective)

1. One person forks the repo, enables GitHub Pages and Actions, creates a fine-grained PAT, and shares the URL + token with the group.
2. Each participant opens the GitHub Pages URL in their browser.
3. **Reading is immediate** - the static page displays all expenses, balances, and the settlement plan. No JavaScript required. No setup needed.
4. To **add** an expense, the user clicks "Add Expense". On first use, they are prompted to configure the CORS proxy address and paste the shared PAT (one-time setup, stored in localStorage).
5. They fill out the expense form, and the app pushes a commit containing the expense data to the repo.
6. GitHub Actions triggers: it reads all expense files, derives the participant list, computes balances and settlements, generates a complete HTML page, and deploys to gh-pages.
7. Participants refresh the page to see the updated balances (after ~1-2 min).

### Data Model

Expenses are stored as individual JSON files in a `data/expenses/` directory:

```json
{
  "id": "2026-03-06T12-34-56-abc123",
  "description": "Dinner at restaurant",
  "amount": 84.50,
  "currency": "EUR",
  "paidBy": "Alice",
  "splitBetween": ["Alice", "Bob", "Charlie"],
  "date": "2026-03-06",
  "createdBy": "Alice",
  "createdAt": "2026-03-06T12:34:56Z"
}
```

The individual expense files are the source of truth. At build time, the CI pipeline:
- Derives the participant list from all expense files (no manual group management)
- Computes balances and a settlement plan (minimizing number of transactions)
- Generates a complete `index.html` with all data rendered as HTML+CSS

Single currency per group. No expense editing or deletion in the first prototype.

### Conflict Handling

Since multiple users can push concurrently, the app must handle conflicts:
- Before pushing, the app pulls the latest state.
- Expenses are individual files (not appended to a single file), so conflicts are unlikely.
- If a push fails due to a concurrent update, the app pulls again and retries.

## Constraints & Trade-offs

- **Latency**: 15s-2min for changes to appear (GitHub Actions build + deploy time).
- **Rate limits**: GitHub Actions has usage limits on free accounts (~2000 min/month). The zero-dependency build keeps each run short (~15-20s), maximizing the number of updates possible.
- **Auth token security**: The shared PAT is visible to all group members. The repo should contain no sensitive data beyond the expense records themselves.
- **Proxy requirement**: Users must run their own CORS proxy. This is the main UX friction point.
- **GitHub dependency**: While we avoid their API, we still depend on GitHub for hosting, Actions, and Pages.
- **No JavaScript required for reading**: The read-only view is pure HTML+CSS. JavaScript is only loaded for the add-expense flow.
