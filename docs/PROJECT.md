# GitSplit - Splitwise Clone Powered by Git CI/CD

## Vision

Hosting static sites is free and simple (GitHub Pages), but anything requiring a backend introduces complexity: cloud provider signups, infrastructure setup, unpredictable costs. This project explores using GitHub's free CI/CD pipelines as a substitute for a traditional backend server.

The result is a fully self-hosted, decentralized application where:
- The **frontend** is a static web app served via GitHub Pages
- The **backend logic** runs inside GitHub Actions workflows
- The **database** is the git repository itself (JSON/data files)
- There is **no central server** and **no dependency on a third party** beyond GitHub

Any person who wants their own instance simply forks the repo and gets a fully independent deployment.

## Architecture

```
User's Browser (PWA)
    |
    | isomorphic-git (clone, commit, push over HTTP)
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
    - validates & processes new data
    - rebuilds static site with updated state
    - pushes rebuilt site to gh-pages branch
    |
    v
GitHub Pages (serves updated static site)
```

### Key Design Decisions

- **No GitHub API usage.** All interaction with GitHub is via git-over-HTTP using isomorphic-git. This avoids requiring a registered GitHub OAuth app and keeps the system independent.
- **CORS proxy is user-controlled.** The proxy adds missing CORS headers to GitHub's HTTP git responses. It is never a shared/public service. Options:
  - Local proxy on the user's machine (development)
  - Android companion app acting as a proxy (mobile use)
  - Self-hosted Cloudflare Worker (tech-savvy users deploy their own)
- **Shared fine-grained Personal Access Token.** All participants in a group share a single PAT scoped to the specific repo (Contents: read/write only). The token is stored in each user's browser (localStorage). All commits appear under one GitHub account, but commit metadata can carry the actual author name.
- **Eventual consistency.** Changes are not instant. After a push, GitHub Actions takes 30s-2min to rebuild. Users refresh or poll to see updates. This is acceptable for the target use case.

## Application: GitSplit

A splitwise-style expense tracker for small groups:
- Participants add shared expenses (who paid, how much, who was involved)
- The app calculates the net balances (who owes whom)
- The settlement summary is displayed on the static site

### How It Works (User Perspective)

1. One person forks the repo, enables GitHub Pages and Actions, creates a fine-grained PAT, and shares the URL + token with the group.
2. Each participant opens the GitHub Pages URL in their browser.
3. **Reading is immediate** - the static site displays all expenses, balances, and the settlement plan. No setup needed to view data.
4. To **add** an expense, the user clicks "Add Expense". On first use, they are prompted to configure the CORS proxy address and paste the shared PAT (one-time setup, stored in localStorage).
5. They fill out the expense form, and the app pushes a commit containing the expense data to the repo.
6. GitHub Actions triggers: it reads all expense files, derives the participant list, computes balances and settlements, writes the results to `data/computed.json`, rebuilds the static site, and deploys to gh-pages.
7. Participants refresh the page to see the updated balances (after ~1-2 min for the Actions build).

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
- Computes balances and a settlement plan
- Writes everything to `data/computed.json`, which the static site reads and renders

Single currency per group. No expense editing or deletion in the first prototype.

### Conflict Handling

Since multiple users can push concurrently, the app must handle conflicts:
- Before pushing, the app pulls the latest state.
- Expenses are individual files (not appended to a single file), so conflicts are unlikely.
- If a push fails due to a concurrent update, the app pulls again and retries.

## Constraints & Trade-offs

- **Latency**: 30s-2min for changes to appear (GitHub Actions build time).
- **Rate limits**: GitHub Actions has usage limits on free accounts (~2000 min/month). Sufficient for low-frequency use.
- **Auth token security**: The shared PAT is visible to all group members. The repo should contain no sensitive data beyond the expense records themselves.
- **Proxy requirement**: Users must run their own CORS proxy. This is the main UX friction point.
- **GitHub dependency**: While we avoid their API, we still depend on GitHub for hosting, Actions, and Pages.
