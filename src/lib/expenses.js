/**
 * Expense write operations via git.
 */

import { GitClient } from './git.js';

/**
 * Generate a unique expense ID.
 * Format: 2026-03-06T12-34-56-abc123
 */
function generateId() {
  const now = new Date();
  const ts = now.toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d+Z$/, '');
  const rand = Math.random().toString(36).slice(2, 8);
  return ts + '-' + rand;
}

/**
 * Add an expense: creates a JSON file, commits, and pushes.
 *
 * @param {Object} opts
 * @param {string} opts.description
 * @param {number} opts.amount
 * @param {string} opts.currency
 * @param {string} opts.paidBy
 * @param {string[]} opts.splitBetween
 * @param {string} opts.date - YYYY-MM-DD
 * @returns {Promise<string>} The expense ID
 */
async function addExpense({ description, amount, currency, paidBy, splitBetween, date }) {
  const config = GitClient.getConfig();
  const id = generateId();

  const expense = {
    id,
    description,
    amount,
    currency,
    paidBy,
    splitBetween,
    date,
    createdBy: config.authorName,
    createdAt: new Date().toISOString(),
  };

  const filepath = 'data/expenses/' + id + '.json';
  const content = JSON.stringify(expense, null, 2) + '\n';
  const message = 'Add expense: ' + description;

  await GitClient.commitAndPush(filepath, content, message);

  return id;
}

export const Expenses = { addExpense };
