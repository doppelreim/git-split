/**
 * GitSplit client-side JS.
 * Handles the setup flow and add-expense form.
 * Depends on: git.js, expenses.js, isomorphic-git, lightning-fs (all loaded via script tags).
 */

(function () {
  'use strict';

  // --- DOM helpers 11 ---

  function el(tag, attrs, ...children) {
    const elem = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'style' && typeof v === 'object') {
          Object.assign(elem.style, v);
        } else if (k.startsWith('on')) {
          elem.addEventListener(k.slice(2), v);
        } else {
          elem.setAttribute(k, v);
        }
      }
    }
    for (const child of children) {
      if (typeof child === 'string') {
        elem.appendChild(document.createTextNode(child));
      } else if (child) {
        elem.appendChild(child);
      }
    }
    return elem;
  }

  // --- Modal ---

  let currentModal = null;

  function showModal(content) {
    closeModal();
    const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) closeModal(); } },
      el('div', { class: 'modal-content' }, content)
    );
    document.body.appendChild(overlay);
    currentModal = overlay;
  }

  function closeModal() {
    if (currentModal) {
      currentModal.remove();
      currentModal = null;
    }
  }

  // --- Setup form ---

  function isConfigured() {
    return localStorage.getItem('gitsplit_repo_url') && localStorage.getItem('gitsplit_pat');
  }

  function showSetup(onDone) {
    const form = el('form', { class: 'setup-form' },
      el('h2', {}, 'Setup Connection'),
      el('p', { class: 'setup-hint' }, 'One-time setup to enable adding expenses.'),

      el('label', { for: 'setup-repo' }, 'Repository URL'),
      el('input', { type: 'url', id: 'setup-repo', placeholder: 'https://github.com/user/repo', required: '', value: localStorage.getItem('gitsplit_repo_url') || '' }),

      el('label', { for: 'setup-pat' }, 'Personal Access Token'),
      el('input', { type: 'password', id: 'setup-pat', placeholder: 'github_pat_...', required: '', value: localStorage.getItem('gitsplit_pat') || '' }),

      el('label', { for: 'setup-proxy' }, 'CORS Proxy URL'),
      el('input', { type: 'url', id: 'setup-proxy', placeholder: 'http://localhost:9999', value: localStorage.getItem('gitsplit_proxy_url') || 'http://localhost:9999' }),

      el('label', { for: 'setup-name' }, 'Your Display Name'),
      el('input', { type: 'text', id: 'setup-name', placeholder: 'Alice', required: '', value: localStorage.getItem('gitsplit_author_name') || '' }),

      el('div', { class: 'form-actions' },
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: closeModal }, 'Cancel'),
        el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save & Connect')
      ),
      el('div', { id: 'setup-status', class: 'status-msg' })
    );

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = document.getElementById('setup-status');
      status.textContent = 'Testing connection...';
      status.className = 'status-msg loading';

      localStorage.setItem('gitsplit_repo_url', document.getElementById('setup-repo').value.trim());
      localStorage.setItem('gitsplit_pat', document.getElementById('setup-pat').value.trim());
      localStorage.setItem('gitsplit_proxy_url', document.getElementById('setup-proxy').value.trim());
      localStorage.setItem('gitsplit_author_name', document.getElementById('setup-name').value.trim());

      try {
        const ok = await GitClient.testConnection();
        if (ok) {
          status.textContent = 'Connected!';
          status.className = 'status-msg success';
          setTimeout(() => {
            closeModal();
            if (onDone) onDone();
          }, 500);
        } else {
          status.textContent = 'Connection failed. Check your settings.';
          status.className = 'status-msg error';
        }
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
        status.className = 'status-msg error';
      }
    });

    showModal(form);
  }

  // --- Add Expense form ---

  function collectParticipants() {
    // Gather names from the rendered page (balances section)
    const names = new Set();
    document.querySelectorAll('.balance-item .name').forEach(el => {
      names.add(el.textContent.trim());
    });
    // Also include the current user
    const authorName = localStorage.getItem('gitsplit_author_name');
    if (authorName) names.add(authorName);
    return [...names].sort();
  }

  function showAddExpense() {
    const participants = collectParticipants();

    const form = el('form', { class: 'expense-form' },
      el('h2', {}, 'Add Expense'),

      el('label', { for: 'exp-desc' }, 'Description'),
      el('input', { type: 'text', id: 'exp-desc', placeholder: 'Dinner, groceries, etc.', required: '' }),

      el('label', { for: 'exp-amount' }, 'Amount'),
      el('input', { type: 'number', id: 'exp-amount', placeholder: '0.00', step: '0.01', min: '0.01', required: '' }),

      el('label', { for: 'exp-paid-by' }, 'Paid by'),
      createPaidBySelect(participants),

      el('label', {}, 'Split between'),
      createSplitCheckboxes(participants),

      el('label', { for: 'exp-date' }, 'Date'),
      el('input', { type: 'date', id: 'exp-date', value: new Date().toISOString().slice(0, 10), required: '' }),

      el('div', { class: 'form-actions' },
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: closeModal }, 'Cancel'),
        el('button', { type: 'submit', class: 'btn btn-primary' }, 'Add Expense')
      ),
      el('div', { id: 'expense-status', class: 'status-msg' })
    );

    form.addEventListener('submit', handleAddExpense);
    showModal(form);
  }

  function createPaidBySelect(participants) {
    const container = el('div', { class: 'paid-by-container' });
    const select = el('select', { id: 'exp-paid-by', required: '' });

    for (const name of participants) {
      select.appendChild(el('option', { value: name }, name));
    }
    select.appendChild(el('option', { value: '__new__' }, '+ New person'));
    container.appendChild(select);

    const newInput = el('input', { type: 'text', id: 'exp-paid-by-new', placeholder: 'Enter name', style: { display: 'none' } });
    container.appendChild(newInput);

    select.addEventListener('change', () => {
      newInput.style.display = select.value === '__new__' ? '' : 'none';
      if (select.value === '__new__') newInput.focus();
    });

    return container;
  }

  function createSplitCheckboxes(participants) {
    const container = el('div', { class: 'split-checkboxes', id: 'exp-split' });

    for (const name of participants) {
      const id = 'split-' + name.replace(/\s+/g, '-');
      container.appendChild(
        el('label', { class: 'checkbox-label' },
          el('input', { type: 'checkbox', value: name, id, checked: '' }),
          document.createTextNode(' ' + name)
        )
      );
    }

    // "Add new" button
    const addBtn = el('button', { type: 'button', class: 'btn btn-small', onclick: () => {
      const name = prompt('Enter new participant name:');
      if (name && name.trim()) {
        const trimmed = name.trim();
        const id = 'split-' + trimmed.replace(/\s+/g, '-');
        const label = el('label', { class: 'checkbox-label' },
          el('input', { type: 'checkbox', value: trimmed, id, checked: '' }),
          document.createTextNode(' ' + trimmed)
        );
        container.insertBefore(label, addBtn);

        // Also add to paid-by select
        const select = document.getElementById('exp-paid-by');
        const newOpt = el('option', { value: trimmed }, trimmed);
        select.insertBefore(newOpt, select.querySelector('option[value="__new__"]'));
      }
    } }, '+ Add person');
    container.appendChild(addBtn);

    return container;
  }

  async function handleAddExpense(e) {
    e.preventDefault();
    const status = document.getElementById('expense-status');

    // Gather values
    const paidBySelect = document.getElementById('exp-paid-by');
    let paidBy = paidBySelect.value;
    if (paidBy === '__new__') {
      paidBy = document.getElementById('exp-paid-by-new').value.trim();
      if (!paidBy) {
        status.textContent = 'Please enter the payer\'s name.';
        status.className = 'status-msg error';
        return;
      }
    }

    const splitChecked = document.querySelectorAll('#exp-split input[type="checkbox"]:checked');
    const splitBetween = [...splitChecked].map(cb => cb.value);
    if (splitBetween.length === 0) {
      status.textContent = 'Select at least one person to split between.';
      status.className = 'status-msg error';
      return;
    }

    const description = document.getElementById('exp-desc').value.trim();
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const date = document.getElementById('exp-date').value;
    const currency = 'EUR'; // Single currency for now

    status.textContent = 'Cloning repo and pushing expense...';
    status.className = 'status-msg loading';

    try {
      await GitClient.clone();
      const id = await Expenses.addExpense({ description, amount, currency, paidBy, splitBetween, date });
      status.textContent = 'Expense added! The page will update in ~1-2 minutes after CI rebuilds.';
      status.className = 'status-msg success';
      // Disable submit to prevent double-adds
      e.target.querySelector('button[type="submit"]').disabled = true;
    } catch (err) {
      console.error('Failed to add expense:', err);
      status.textContent = 'Error: ' + err.message;
      status.className = 'status-msg error';
    }
  }

  // --- Init ---

  function init() {
    const btn = document.getElementById('add-expense-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (!isConfigured()) {
        showSetup(() => showAddExpense());
      } else {
        showAddExpense();
      }
    });
  }

  // --- Inject modal + form styles ---

  const style = document.createElement('style');
  style.textContent = `
    .modal-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000;
      padding: 16px;
    }
    .modal-content {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      width: 100%;
      max-width: 440px;
      max-height: 90vh;
      overflow-y: auto;
    }
    .setup-form h2, .expense-form h2 { margin-bottom: 8px; }
    .setup-hint { color: #666; font-size: 0.85rem; margin-bottom: 16px; }
    .setup-form label, .expense-form label {
      display: block; font-size: 0.85rem; font-weight: 600; margin-top: 12px; margin-bottom: 4px;
    }
    .setup-form input, .setup-form select,
    .expense-form input, .expense-form select {
      display: block; width: 100%; padding: 10px; font-size: 1rem;
      border: 1px solid #d1d5db; border-radius: 6px;
    }
    .form-actions { display: flex; gap: 8px; margin-top: 20px; }
    .btn {
      padding: 10px 20px; font-size: 0.95rem; font-weight: 600;
      border: none; border-radius: 6px; cursor: pointer;
    }
    .btn-primary { background: #2563eb; color: #fff; flex: 1; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .btn-secondary:hover { background: #d1d5db; }
    .btn-small { padding: 4px 10px; font-size: 0.8rem; background: #e5e7eb; border-radius: 4px; margin-top: 6px; }
    .status-msg { margin-top: 12px; padding: 8px; border-radius: 6px; font-size: 0.9rem; }
    .status-msg:empty { display: none; }
    .status-msg.loading { background: #eff6ff; color: #1d4ed8; }
    .status-msg.success { background: #f0fdf4; color: #16a34a; }
    .status-msg.error { background: #fef2f2; color: #dc2626; }
    .split-checkboxes { display: flex; flex-wrap: wrap; gap: 8px; }
    .checkbox-label { display: flex; align-items: center; gap: 4px; font-weight: normal !important; font-size: 0.95rem; }
    .paid-by-container select { margin-bottom: 4px; }
  `;
  document.head.appendChild(style);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
