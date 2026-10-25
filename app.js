'use strict';
/* ───────── 1. CONFIG: single source of truth for categories ───────── */
const CATS = {
  debit: { Food:['🍔','#ff4b6e'], Travel:['✈️','#4d9fff'], Shopping:['🛍️','#ffd700'], Bills:['⚡','#fb923c'],
           Health:['🏥','#a78bfa'], Entertainment:['🎮','#00e87a'], Other:['📦','#8793b0'] },
  credit:{ Salary:['💼'], Gift:['🎁'], Business:['🏢'], Freelance:['💻'], Investment:['📈'], Other:['📦'] }
};
const KEY = 'fintrack_v2', VERSION = 3;
const known = (type, cat) => Object.hasOwn(CATS[type], cat);
const icon = (type, cat) => known(type, cat) ? CATS[type][cat][0] : '💸';

/* ───────── 2. HELPERS (pure) ───────── */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr = new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR' });
const money = paise => inr.format(paise / 100);              // money lives as integer paise
const toPaise = v => Math.round(parseFloat(v) * 100 + 1e-9);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;   // local date, not UTC
const ym = s => s.slice(0, 7);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random());
const monthKey = off => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth() + off, 1)).slice(0, 7); };

const sum = (a, t) => a.filter(x => x.type === t).reduce((s, x) => s + x.amt, 0);
const totals = txs => { const c = sum(txs,'credit'), d = sum(txs,'debit');
  return { c, d, net: c - d, rate: c ? Math.round((c - d) / c * 100) : null }; };
const byCat = txs => txs.filter(t => t.type === 'debit').reduce((m, t) => (m[t.cat] = (m[t.cat] || 0) + t.amt, m), {});
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(new Date(s + 'T00:00:00')) === s;
const MAX_PAISE = 1e13;   // ₹100 billion per transaction keeps every sum below 2^53
const validTx = t => t && ['credit','debit'].includes(t.type) && Number.isSafeInteger(t.amt) && t.amt > 0 && t.amt <= MAX_PAISE && validDate(t.date);

/* ───────── 3. STATE + persistence + migration ───────── */
function fresh() { return { version: VERSION, transactions: [], budgets: {}, chart: 'bar', theme: (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light' }; }
function migrate(s) {
  if (!s || typeof s !== 'object') return fresh();
  let tx = (Array.isArray(s.transactions) ? s.transactions : []).filter(t => t && typeof t === 'object');
  if (!s.version) tx = tx.map(t => ({ ...t, amt: Math.round(t.amt * 100) }));          // v2 stored rupees
  const seen = new Set();
  tx = tx.filter(validTx).map(t => {                                                   // unique string ids, safe categories
    let id = t.id == null ? '' : String(t.id); if (!id || seen.has(id)) id = uid(); seen.add(id);
    return { id, type: t.type, amt: t.amt, date: t.date, desc: String(t.desc ?? '').slice(0, 80), cat: known(t.type, t.cat) ? t.cat : 'Other' };
  });
  const budgets = {};
  for (const c of Object.keys(CATS.debit)) { const v = s.budgets && s.budgets[c]; if (Number.isSafeInteger(v) && v > 0) budgets[c] = v; }
  return { version: VERSION, transactions: tx, budgets, chart: ['bar','doughnut','line'].includes(s.chart) ? s.chart : 'bar',
           theme: ['light','dark'].includes(s.theme) ? s.theme : fresh().theme };
}
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); return migrate(JSON.parse(raw)); }
  catch { try { if (raw) localStorage.setItem(KEY + '_corrupt', raw); } catch {} return fresh(); }   // keep a recovery copy
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); return true; }
  catch { toast('NOT saved: storage is full or blocked. Export a backup now.', 'error'); return false; } }
function setState(patch = {}) { Object.assign(S, patch); const ok = save(); render(); return ok; }   // state → save → render, always together

let S = load();
let formType = 'debit', editId = null;
const view = { range:'all', from:'', to:'', q:'', sort:'new', type:'all' };

/* ───────── 4. FILTERING ───────── */
function inRange(t) {
  if (view.range === 'month') return ym(t.date) === monthKey(0);
  if (view.range === 'last')  return ym(t.date) === monthKey(-1);
  if (view.range === 'custom') { const [lo, hi] = view.from && view.to && view.from > view.to ? [view.to, view.from] : [view.from, view.to];
    return (!lo || t.date >= lo) && (!hi || t.date <= hi); }
  return true;
}
const scoped = () => S.transactions.filter(inRange);
function listed() {
  const q = view.q.toLowerCase();
  const l = scoped().filter(t => (view.type === 'all' || t.type === view.type) && (!q || (t.desc + t.cat).toLowerCase().includes(q)));
  const sorts = { new:(a,b)=>b.date.localeCompare(a.date), old:(a,b)=>a.date.localeCompare(b.date), high:(a,b)=>b.amt-a.amt, low:(a,b)=>a.amt-b.amt };
  return l.sort(sorts[view.sort]);
}

/* ───────── 5. RENDER ───────── */
function render() {
  document.documentElement.dataset.theme = S.theme;
  const txs = scoped(), T = totals(txs);
  $('#totalCredit').textContent = money(T.c);
  $('#totalDebit').textContent = money(T.d);
  const net = $('#netBalance'); net.textContent = (T.net < 0 ? '−' : '') + money(Math.abs(T.net));
  net.className = 'summary-value ' + (T.net >= 0 ? 'green' : 'red');
  $('#creditCount').textContent = txs.filter(t => t.type === 'credit').length + ' transactions';
  $('#debitCount').textContent = txs.filter(t => t.type === 'debit').length + ' transactions';
  $('#balanceStatus').textContent = !txs.length ? 'No data yet' : T.net >= 0 ? '✅ In surplus' : '⚠️ In deficit';
  $('#savingsRate').textContent = T.rate === null ? '—' : T.rate + '%';
  const top = Object.entries(byCat(txs)).sort((a,b) => b[1]-a[1])[0];
  $('#topCategory').textContent = top ? 'Top spend: ' + top[0] : 'No expenses yet';

  // balance ring: tip depends on savings RATE, not a hardcoded rupee amount
  const bv = $('#balanceVal'); bv.textContent = (T.net < 0 ? '−' : '') + money(Math.abs(T.net));
  bv.className = 'balance-val ' + (T.net >= 0 ? 'positive' : 'negative');
  const r = T.rate, tip = r === null ? (T.d ? ['😰','Spending with no income logged'] : ['😐','Start adding transactions'])
    : r >= 30 ? ['🤑','Saving 30%+ — crushing it! 🚀'] : r >= 10 ? ['😊','Healthy savings. Keep it up'] : r >= 0 ? ['😟','Tight month — savings under 10%'] : ['😰','Spending exceeds income'];
  $('#balanceEmoji').textContent = tip[0]; $('#balanceTip').textContent = tip[1];
  $('#balanceRing').setAttribute('aria-label', 'Net balance ' + bv.textContent + '. ' + tip[1]);
  const pct = T.c + T.d ? T.c / (T.c + T.d) * 100 : 50;
  $('#balanceRing').style.background = `conic-gradient(var(--green) ${pct}%, var(--red) 0)`;

  renderInsights(txs); renderBudgets(); renderHistory(); renderChart(txs);
}

function renderInsights(txs) {
  const now = new Date(), out = [];
  const cur = S.transactions.filter(t => ym(t.date) === monthKey(0)), prev = S.transactions.filter(t => ym(t.date) === monthKey(-1));
  const spent = sum(cur, 'debit');
  if (spent) { const dim = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate(), day = now.getDate();
    out.push(`📅 Daily average <b>${money(spent/day)}</b> → projected month-end spend <b>${money(spent/day*dim)}</b>`); }
  const c = byCat(cur), p = byCat(prev), top = Object.entries(c).sort((a,b) => b[1]-a[1])[0];
  if (top) { const pv = p[top[0]];
    out.push(`🏆 Biggest category this month: <b>${esc(top[0])}</b> (${money(top[1])})` + (pv ? ` — ${top[1] >= pv ? '▲' : '▼'} ${Math.abs(Math.round((top[1]-pv)/pv*100))}% vs last month` : '')); }
  const t3 = txs.filter(t => t.type === 'debit').sort((a,b) => b.amt-a.amt).slice(0, 3);
  if (t3.length) out.push('💸 Top expenses: ' + t3.map(t => `${esc(t.desc)} <b>${money(t.amt)}</b>`).join(' · '));
  const T = totals(txs); if (T.rate !== null) out.push(`🏦 Savings rate in this range: <b>${T.rate}%</b>`);
  $('#insights').innerHTML = out.length ? out.map(x => `<li>${x}</li>`).join('') : '<li>Add some transactions to see insights.</li>';
}

function renderBudgets() {
  const c = byCat(S.transactions.filter(t => t.type === 'debit' && ym(t.date) === monthKey(0))), box = $('#budgets');
  if (!box.children.length) box.innerHTML = Object.keys(CATS.debit).map(cat => `<div class="bud" data-c="${cat}"><div class="bud-top"><span></span>
    <input type="number" min="0" step="1" placeholder="Limit ₹" data-cat="${cat}" aria-label="${cat} monthly budget"></div><div class="bar"><i></i></div><div class="bud-sub"></div></div>`).join('');
  box.querySelectorAll('.bud').forEach(r => {
    const cat = r.dataset.c, lim = S.budgets[cat] || 0, used = c[cat] || 0, p = lim ? used / lim * 100 : 0, inp = r.querySelector('input');
    r.querySelector('span').textContent = `${icon('debit', cat)} ${cat} · ${money(used)}`;
    if (document.activeElement !== inp) inp.value = lim ? lim / 100 : '';
    const bar = r.querySelector('i'); bar.className = p >= 100 ? 'over' : p >= 90 ? 'warn' : ''; bar.style.width = Math.min(p, 100) + '%';
    r.querySelector('.bud-sub').textContent = !lim ? 'No limit set' : used > lim ? `${money(used - lim)} over · ${Math.round(p)}%` : `${money(lim - used)} left · ${Math.round(p)}%`;
  });
}

function renderHistory() {
  const l = listed();
  $('#history').innerHTML = !l.length ? '<div class="empty-state">🪙 No transactions here yet<br><a href="#fAmt" id="ctaAdd" style="color:var(--blue)">Add your first one →</a></div>'
    : l.map(t => `<div class="history-item" data-id="${esc(t.id)}">
      <div class="hi-icon ${t.type}">${icon(t.type, t.cat)}</div>
      <div class="hi-info"><div class="hi-desc">${esc(t.desc)}</div>
        <div class="hi-meta"><span class="hi-tag ${t.type}">${t.type.toUpperCase()}</span><span>${esc(t.cat)}</span><span>${fmtDate(t.date)}</span></div></div>
      <div class="hi-amount ${t.type}">${t.type === 'credit' ? '+' : '−'}${money(t.amt)}</div>
      <button class="hi-btn" data-act="edit" aria-label="Edit ${esc(t.desc)}">✏️</button>
      <button class="hi-btn" data-act="del" aria-label="Delete ${esc(t.desc)}">✕</button></div>`).join('');
}
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });

let chart;
function renderChart(txs) {
  if (chart) { chart.destroy(); chart = null; }
  $('#chart').setAttribute('aria-label', S.chart === 'line' ? 'Income and expense, last six months' : 'Spending by category');
  if (typeof Chart === 'undefined') { $('#chart').hidden = true; $('#chartEmpty').hidden = false; $('#chartEmpty').textContent = 'Chart library failed to load'; return; }
  document.querySelectorAll('#chartTabs button').forEach(b => b.classList.toggle('active', b.dataset.c === S.chart));
  const st = getComputedStyle(document.documentElement), tc = st.getPropertyValue('--muted').trim(), gc = st.getPropertyValue('--border').trim();
  let cfg;
  if (S.chart === 'line') {
    const ms = [-5,-4,-3,-2,-1,0].map(monthKey), val = (m, t) => sum(S.transactions.filter(x => ym(x.date) === m), t) / 100;
    cfg = { type:'line', data:{ labels: ms.map(m => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month:'short', year:'2-digit' })),
      datasets:[{ label:'Income', data: ms.map(m => val(m,'credit')), borderColor:'#00e87a', tension:.3 },
                { label:'Expense', data: ms.map(m => val(m,'debit')), borderColor:'#ff4b6e', tension:.3 }] } };
  } else {
    const m = byCat(txs), labels = Object.keys(m);
    $('#chartEmpty').hidden = !!labels.length; $('#chart').hidden = !labels.length;
    if (!labels.length) return;
    const col = labels.map(l => known('debit', l) ? CATS.debit[l][1] : '#8793b0');
    cfg = { type: S.chart, data:{ labels, datasets:[{ label:'Spent (₹)', data: labels.map(l => m[l]/100),
      backgroundColor: S.chart === 'bar' ? col.map(c => c + '55') : col, borderColor: col, borderWidth:2, borderRadius: S.chart === 'bar' ? 8 : 0 }] } };
  }
  if (S.chart === 'line') { $('#chartEmpty').hidden = true; $('#chart').hidden = false; }
  const noAxes = S.chart === 'doughnut';
  cfg.options = { responsive:true, plugins:{ legend:{ display: S.chart !== 'bar', labels:{ color: tc } },
    tooltip:{ callbacks:{ label: c => ' ' + inr.format(c.parsed.y ?? c.parsed) } } },
    scales: noAxes ? {} : { x:{ ticks:{ color: tc }, grid:{ color: gc } }, y:{ ticks:{ color: tc, callback: v => inr.format(v) }, grid:{ color: gc } } } };
  chart = new Chart($('#chart').getContext('2d'), cfg);
}

/* ───────── 6. FORM (one form, two types) ───────── */
function setFormType(t) {
  formType = t;
  document.querySelectorAll('.seg-btn').forEach(b => { const on = b.dataset.type === t; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  $('#fCat').innerHTML = Object.keys(CATS[t]).map(c => `<option value="${c}">${icon(t,c)} ${c}</option>`).join('');
  const b = $('#fSubmit'); b.className = 'btn ' + (t === 'debit' ? 'btn-debit' : 'btn-credit');
  b.textContent = editId ? 'Save changes' : t === 'debit' ? 'Add expense' : 'Add income';
}
function resetForm() {
  editId = null; $('#txForm').reset(); $('#fDate').value = ymd(new Date());
  $('#fCancel').hidden = true; $('#formTitle').textContent = 'Add transaction'; setFormType(formType);
}
function submitForm(e) {
  e.preventDefault();
  const amt = toPaise($('#fAmt').value), date = $('#fDate').value;
  if (!(amt > 0) || amt > MAX_PAISE) return toast('Enter a valid amount', 'error');
  if (!date) return toast('⚠️ Pick a date', 'error');
  const rec = { type: formType, amt, date, cat: $('#fCat').value, desc: $('#fDesc').value.trim() || (formType === 'debit' ? 'Expense' : 'Income') };
  let msg;
  if (editId) { S.transactions = S.transactions.map(t => t.id === editId ? { ...t, ...rec } : t); msg = ['Transaction updated', 'info']; }
  else { S.transactions.unshift({ id: uid(), ...rec }); msg = [formType === 'debit' ? `−${money(amt)} recorded` : `+${money(amt)} added`, formType === 'debit' ? 'error' : 'success']; }
  resetForm(); if (setState()) toast(...msg);
}
function startEdit(id) {
  const t = S.transactions.find(x => x.id === id); if (!t) return;
  editId = id; setFormType(t.type);
  $('#fAmt').value = t.amt / 100; $('#fDate').value = t.date; $('#fCat').value = t.cat; $('#fDesc').value = t.desc;
  $('#fCancel').hidden = false; $('#formTitle').textContent = 'Edit transaction';
  $('#fAmt').scrollIntoView({ behavior:'smooth', block:'center' }); $('#fAmt').focus();
}
function removeTx(id) {                       // soft delete → undo window
  const i = S.transactions.findIndex(t => t.id === id); if (i < 0) return;
  const ds = S.transactions, [t] = ds.splice(i, 1); setState();
  toast('Transaction deleted', 'info', { label:'Undo', fn: () => { if (S.transactions !== ds) return; ds.splice(Math.min(i, ds.length), 0, t); setState(); } });
}

/* ───────── 7. DATA: export / import / seed ───────── */
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
const csvCell = v => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };  // blocks CSV formula injection
function exportCsv() {
  const rows = [['Date','Type','Category','Note','Amount (INR)'], ...listed().map(t => [t.date, t.type, t.cat, t.desc, (t.amt/100).toFixed(2)])];
  download('fintrack.csv', '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv');
}
function importJson(file) {
  const rd = new FileReader();
  rd.onload = () => {
    let raw, d;
    try { raw = JSON.parse(rd.result); d = migrate(raw); } catch { return toast('Invalid backup file', 'error'); }
    const total = Array.isArray(raw && raw.transactions) ? raw.transactions.length : 0, skipped = total - d.transactions.length;
    if (!confirm(`This REPLACES your ${S.transactions.length} transactions with ${d.transactions.length} from the file` + (skipped > 0 ? ` (${skipped} invalid rows skipped)` : '') + '. Continue?')) return;
    const old = S;
    try { S = d; setState(); toast('Backup restored', 'success'); }
    catch { S = old; save(); render(); toast('Import failed. Your data was not changed.', 'error'); }   // roll back
  };
  rd.readAsText(file);
}
function seed() {
  const rnd = n => Math.floor(Math.random() * n), pick = a => a[rnd(a.length)], now = new Date(), out = [];
  const exp = [['Food','Lunch',150,400],['Food','Groceries',600,1800],['Travel','Metro / auto',40,300],['Shopping','Clothes',800,3000],
               ['Entertainment','Movie night',250,600],['Health','Pharmacy',100,700],['Other','Misc',50,400]];
  for (let m = 0; m < 4; m++) {
    const add = (day, type, cat, desc, rupees) => { const d = new Date(now.getFullYear(), now.getMonth() - m, day);
      if (d <= now) out.push({ id: uid(), type, cat, desc, amt: rupees * 100, date: ymd(d) }); };
    add(1,'credit','Salary','Monthly salary',30000); add(9,'credit','Freelance','Side project',2000 + rnd(4000));
    add(3,'debit','Bills','Electricity & internet',1200 + rnd(300));
    for (let i = 0; i < 8; i++) { const [c, n, lo, hi] = pick(exp); add(2 + rnd(26), 'debit', c, n, lo + rnd(hi - lo)); }
  }
  setState({ transactions: [...out, ...S.transactions], budgets: { Food: 500000, Entertainment: 100000, ...S.budgets } });
  toast('Demo data loaded', 'success');
}

/* ───────── 8. TOAST (with optional action) ───────── */
function toast(msg, type = 'info', action) {
  const el = document.createElement('div'); el.className = 'toast ' + type;
  const sp = document.createElement('span'); sp.textContent = msg; el.append(sp);       // textContent, never innerHTML
  if (action) { const b = document.createElement('button'); b.textContent = action.label;
    b.onclick = () => { action.fn(); el.remove(); }; el.append(b); }
  $('#toast-container').append(el); setTimeout(() => el.remove(), action ? 5000 : 2800);
}

/* ───────── 9. EVENTS (delegation) ───────── */
document.addEventListener('DOMContentLoaded', () => {
  $('#headerDate').textContent = new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });

  $('#txForm').addEventListener('submit', submitForm);
  $('#fCancel').addEventListener('click', resetForm);
  document.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (b) setFormType(b.dataset.type); });
  $('#history').addEventListener('click', e => {
    const id = e.target.closest('[data-id]')?.dataset.id, act = e.target.closest('[data-act]')?.dataset.act;
    if (id && act === 'del') removeTx(id); else if (id && act === 'edit') startEdit(id);
    else if (e.target.id === 'ctaAdd') { e.preventDefault(); $('#fAmt').focus(); }
  });
  $('#typeFilter').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return;
    view.type = b.dataset.t; document.querySelectorAll('#typeFilter button').forEach(x => x.classList.toggle('active', x === b)); renderHistory(); });
  $('#chartTabs').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) setState({ chart: b.dataset.c }); });
  $('#budgets').addEventListener('change', e => { const c = e.target.dataset.cat; if (!c) return;
    const b = { ...S.budgets }, v = toPaise(e.target.value); if (v > 0) b[c] = v; else delete b[c]; setState({ budgets: b }); });
  $('#range').addEventListener('change', e => { view.range = e.target.value; $('#custom').hidden = view.range !== 'custom'; render(); });
  $('#rFrom').addEventListener('change', e => { view.from = e.target.value; render(); });
  $('#rTo').addEventListener('change', e => { view.to = e.target.value; render(); });
  $('#q').addEventListener('input', e => { view.q = e.target.value; renderHistory(); });
  $('#sort').addEventListener('change', e => { view.sort = e.target.value; renderHistory(); });
  $('#themeBtn').addEventListener('click', () => setState({ theme: S.theme === 'dark' ? 'light' : 'dark' }));
  $('#expJson').addEventListener('click', () => download('fintrack-backup.json', JSON.stringify(S, null, 2), 'application/json'));
  $('#expCsv').addEventListener('click', exportCsv);
  $('#impBtn').addEventListener('click', () => $('#impFile').click());
  $('#impFile').addEventListener('change', e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
  $('#seedBtn').addEventListener('click', seed);
  $('#clearBtn').addEventListener('click', () => { if (confirm('Delete ALL transactions and budgets? Export a backup first.')) setState({ transactions: [], budgets: {} }); });
  setFormType('debit'); resetForm(); render();      // render last: a render error can no longer prevent listeners
});
