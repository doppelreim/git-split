/**
 * Git operations wrapper around isomorphic-git.
 * Handles clone, commit, push, and pull via a CORS proxy.
 *
 * Expects global `git` (isomorphic-git) and `LightningFS` to be loaded via script tags.
 * Configuration is read from localStorage.
 */

/* global git, LightningFS */

import http from '../vendor/http-web.js';

const DIR = '/repo';
let fs;
let pfs;
let initialized = false;

/** Read config from localStorage */
function getConfig() {
  const repoUrl = localStorage.getItem('gitsplit_repo_url');
  const pat = localStorage.getItem('gitsplit_pat');
  const proxyUrl = localStorage.getItem('gitsplit_proxy_url') || 'http://localhost:9999';
  const authorName = localStorage.getItem('gitsplit_author_name') || 'GitSplit User';

  if (!repoUrl || !pat) {
    throw new Error('Git configuration missing. Please complete setup first.');
  }

  return { repoUrl, pat, proxyUrl, authorName };
}

/** Initialize the in-memory filesystem */
function ensureFS() {
  if (!initialized) {
    fs = new LightningFS('gitsplit');
    pfs = fs.promises;
    initialized = true;
  }
}

/** Build common options for isomorphic-git calls */
function gitOpts(config) {
  return {
    fs,
    http,
    dir: DIR,
    corsProxy: config.proxyUrl,
    url: config.repoUrl,
    onAuth: () => ({ username: config.pat }),
  };
}

/** Clone the repo (shallow, single branch) */
async function clone() {
  ensureFS();
  const config = getConfig();

  // Wipe any existing clone
  try {
    await pfs.rmdir(DIR, { recursive: true });
  } catch (e) {
    // directory may not exist
  }
  await pfs.mkdir(DIR, { recursive: true });

  await git.clone({
    ...gitOpts(config),
    singleBranch: true,
    depth: 1,
    ref: 'main',
  });
}

/** Pull latest changes (fetch + checkout) */
async function pull() {
  ensureFS();
  const config = getConfig();

  await git.fetch({
    ...gitOpts(config),
    singleBranch: true,
    ref: 'main',
  });

  await git.checkout({
    fs,
    dir: DIR,
    ref: 'main',
    force: true,
  });
}

/**
 * Write a file, stage, commit, and push.
 * If push fails due to non-fast-forward, pulls and retries once.
 *
 * @param {string} filepath - Path relative to repo root (e.g. "data/expenses/abc.json")
 * @param {string} content - File content
 * @param {string} message - Commit message
 * @returns {Promise<void>}
 */
async function commitAndPush(filepath, content, message) {
  ensureFS();
  const config = getConfig();

  // Ensure parent directory exists
  const parts = filepath.split('/');
  for (let i = 1; i < parts.length; i++) {
    const partial = DIR + '/' + parts.slice(0, i).join('/');
    try {
      await pfs.mkdir(partial);
    } catch (e) {
      // already exists
    }
  }

  // Write file
  await pfs.writeFile(DIR + '/' + filepath, content, 'utf8');

  // Stage
  await git.add({ fs, dir: DIR, filepath });

  // Commit
  await git.commit({
    fs,
    dir: DIR,
    message,
    author: {
      name: config.authorName,
      email: 'gitsplit@users.noreply.github.com',
    },
  });

  // Push with retry on conflict
  try {
    await git.push(gitOpts(config));
  } catch (err) {
    if (err.code === 'PushRejectedError' || (err.message && err.message.includes('non-fast-forward'))) {
      console.log('Push rejected, pulling and retrying...');
      await pull();
      // Re-apply: write, stage, commit again
      await pfs.writeFile(DIR + '/' + filepath, content, 'utf8');
      await git.add({ fs, dir: DIR, filepath });
      await git.commit({
        fs,
        dir: DIR,
        message,
        author: {
          name: config.authorName,
          email: 'gitsplit@users.noreply.github.com',
        },
      });
      await git.push(gitOpts(config));
    } else {
      throw err;
    }
  }
}

/**
 * Test the connection by attempting a clone.
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    await clone();
    return true;
  } catch (err) {
    console.error('Connection test failed:', err);
    return false;
  }
}

export const GitClient = { clone, pull, commitAndPush, testConnection, getConfig };
