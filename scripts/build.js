#!/usr/bin/env node
/**
 * GitSplit build script — zero npm dependencies.
 * Reads expense JSON files, computes balances & settlements,
 * and generates a complete static HTML page.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXPENSES_DIR = path.join(ROOT, 'data', 'expenses');
const DIST_DIR = path.join(ROOT, 'dist');

/** Recursively copy a directory */
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// --- Data loading ---

function loadExpenses() {
  if (!fs.existsSync(EXPENSES_DIR)) return [];

  return fs.readdirSync(EXPENSES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const raw = fs.readFileSync(path.join(EXPENSES_DIR, f), 'utf8');
      return JSON.parse(raw);
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// --- Balance computation ---

function computeBalances(expenses) {
  // net[person] = amount they are owed (positive) or owe (negative)
  const net = {};

  for (const exp of expenses) {
    const share = exp.amount / exp.splitBetween.length;
    // Payer is owed by others
    net[exp.paidBy] = (net[exp.paidBy] || 0) + exp.amount;
    // Each participant owes their share
    for (const person of exp.splitBetween) {
      net[person] = (net[person] || 0) - share;
    }
  }

  return net;
}

function computeSettlements(net) {
  // Greedy algorithm: match largest creditor with largest debtor
  const debtors = []; // { name, amount } where amount > 0 (they owe)
  const creditors = []; // { name, amount } where amount > 0 (they are owed)

  for (const [name, balance] of Object.entries(net)) {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded < -0.01) {
      debtors.push({ name, amount: -rounded });
    } else if (rounded > 0.01) {
      creditors.push({ name, amount: rounded });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const payment = Math.min(debtors[i].amount, creditors[j].amount);
    const rounded = Math.round(payment * 100) / 100;

    if (rounded > 0) {
      settlements.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amount: rounded,
      });
    }

    debtors[i].amount -= payment;
    creditors[j].amount -= payment;

    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }

  return settlements;
}

// --- HTML generation ---

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAmount(amount, currency) {
  return `${currency || ''}\u00A0${amount.toFixed(2)}`.trim();
}

function generateHtml(expenses, balances, settlements) {
  const currency = expenses.length > 0 ? expenses[0].currency : 'EUR';
  const participants = Object.keys(balances).sort();

  const balancesHtml = participants.map(name => {
    const bal = Math.round((balances[name] || 0) * 100) / 100;
    const cls = bal > 0.01 ? 'positive' : bal < -0.01 ? 'negative' : 'zero';
    const sign = bal > 0 ? '+' : '';
    return `<li class="balance-item ${cls}">
      <span class="name">${escapeHtml(name)}</span>
      <span class="amount">${sign}${formatAmount(bal, currency)}</span>
    </li>`;
  }).join('\n');

  const settlementsHtml = settlements.length > 0
    ? settlements.map(s =>
        `<li class="settlement-item">
          <span class="from">${escapeHtml(s.from)}</span>
          <span class="arrow">&rarr;</span>
          <span class="to">${escapeHtml(s.to)}</span>
          <span class="amount">${formatAmount(s.amount, currency)}</span>
        </li>`
      ).join('\n')
    : '<li class="empty">All settled up!</li>';

  const expensesHtml = expenses.length > 0
    ? expenses.map(exp => {
        const splitNames = exp.splitBetween.map(escapeHtml).join(', ');
        return `<details class="expense-item">
        <summary>
          <span class="expense-desc">${escapeHtml(exp.description)}</span>
          <span class="expense-amount">${formatAmount(exp.amount, exp.currency)}</span>
          <span class="expense-date">${escapeHtml(exp.date)}</span>
        </summary>
        <div class="expense-details">
          <p>Paid by <strong>${escapeHtml(exp.paidBy)}</strong></p>
          <p>Split between: ${splitNames}</p>
        </div>
      </details>`;
      }).join('\n')
    : '<p class="empty">No expenses yet. Add one to get started!</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitSplit</title>
  <link rel="manifest" href="manifest.json">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 16px;
      background: #f5f5f5;
      color: #1a1a1a;
    }

    h1 {
      font-size: 1.5rem;
      margin-bottom: 4px;
    }

    .subtitle {
      color: #666;
      font-size: 0.85rem;
      margin-bottom: 24px;
    }

    h2 {
      font-size: 1.1rem;
      margin-bottom: 12px;
      padding-bottom: 4px;
      border-bottom: 2px solid #e0e0e0;
    }

    section { margin-bottom: 28px; }

    ul { list-style: none; }

    .balance-item, .settlement-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      margin-bottom: 4px;
      background: #fff;
      border-radius: 6px;
    }

    .balance-item .amount { font-weight: 600; font-variant-numeric: tabular-nums; }
    .positive .amount { color: #16a34a; }
    .negative .amount { color: #dc2626; }
    .zero .amount { color: #888; }

    .settlement-item {
      gap: 8px;
    }
    .settlement-item .arrow { color: #888; }
    .settlement-item .amount { margin-left: auto; font-weight: 600; font-variant-numeric: tabular-nums; }

    .expense-item {
      background: #fff;
      border-radius: 6px;
      margin-bottom: 4px;
    }

    .expense-item summary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      cursor: pointer;
      list-style: none;
    }
    .expense-item summary::-webkit-details-marker { display: none; }
    .expense-item summary::before { content: "\\25B6"; font-size: 0.6rem; color: #888; transition: transform 0.15s; }
    .expense-item[open] summary::before { transform: rotate(90deg); }

    .expense-desc { flex: 1; }
    .expense-amount { font-weight: 600; font-variant-numeric: tabular-nums; }
    .expense-date { color: #888; font-size: 0.85rem; }

    .expense-details {
      padding: 8px 12px 12px 24px;
      font-size: 0.9rem;
      color: #444;
    }
    .expense-details p { margin-bottom: 4px; }

    .empty { color: #888; padding: 12px; font-style: italic; }

    #add-expense-btn {
      display: block;
      width: 100%;
      padding: 14px;
      font-size: 1rem;
      font-weight: 600;
      color: #fff;
      background: #2563eb;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 16px;
    }
    #add-expense-btn:hover { background: #1d4ed8; }

    /* Modal and form styles are injected by app.js */
  </style>
</head>
<body>
  <header>
    <h1>GitSplit</h1>
    <p class="subtitle">Expense sharing, powered by git</p>
  </header>

  <button id="add-expense-btn">+ Add Expense</button>

  <section id="settlements-section">
    <h2>Settlements</h2>
    <ul>${settlementsHtml}</ul>
  </section>

  <section id="balances-section">
    <h2>Balances</h2>
    <ul>${balancesHtml}</ul>
  </section>

  <section id="expenses-section">
    <h2>Expenses</h2>
    ${expensesHtml}
  </section>

  <script src="vendor/isomorphic-git.js"></script>
  <script src="vendor/lightning-fs.js"></script>
  <script type="module" src="app.js"></script>
</body>
</html>`;
}

// --- Main ---

function main() {
  const expenses = loadExpenses();
  const balances = computeBalances(expenses);
  const settlements = computeSettlements(balances);

  const html = generateHtml(expenses, balances, settlements);

  // Ensure dist/ exists
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // Write HTML
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html);

  // Copy app.js and manifest.json from src/
  const filesToCopy = ['app.js', 'manifest.json'];
  for (const file of filesToCopy) {
    const src = path.join(ROOT, 'src', file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DIST_DIR, file));
    }
  }

  // Copy lib/ and vendor/ directories
  copyDirSync(path.join(ROOT, 'src', 'lib'), path.join(DIST_DIR, 'lib'));
  copyDirSync(path.join(ROOT, 'src', 'vendor'), path.join(DIST_DIR, 'vendor'));

  console.log(`Built ${expenses.length} expenses → dist/index.html`);
  console.log(`Participants: ${Object.keys(balances).sort().join(', ') || '(none)'}`);
  console.log(`Settlements: ${settlements.length}`);
}

main();
