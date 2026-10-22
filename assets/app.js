/* Antibiotogram — sourced antimicrobial coverage reference.
   Data lives in /data/*.json; every coverage row, site rule and dose carries a source id from sources.json. */
'use strict';

const RANK = { FD: 4, F: 3, P: 2, V: 1.5, C: 1, I: 0.75, N: 0 };
const KINGDOMS = [
  { id: 'bacteria', label: 'Bacteria', drugs: 'antibacterial', groups: ['Gram-positive', 'Gram-negative', 'Anaerobe', 'Atypical'] },
  { id: 'fungi', label: 'Fungi', drugs: 'antifungal', groups: ['Yeasts', 'Moulds', 'Pneumocystis'] },
  { id: 'viruses', label: 'Viruses', drugs: 'antiviral', groups: ['Respiratory viruses', 'Herpesviruses'] },
];
const POPS = [
  { id: 'neonate', label: 'Neonate', range: 'Birth–28 days' },
  { id: 'infant', label: 'Infant', range: '1–12 months' },
  { id: 'child', label: 'Child', range: '1–17 years' },
  { id: 'adult', label: 'Adult', range: '18+ years' },
];
const RENAL = ['Normal', 'CrCl 30–49', 'CrCl 10–29', 'CrCl < 10', 'Haemodialysis', 'CRRT'];
const HEPATIC = ['Normal', 'Child-Pugh A', 'Child-Pugh B', 'Child-Pugh C'];
const CLASS_HUE = { Penicillin: 205, Cephalosporin: 225, Carbapenem: 260, 'BL/BLI': 280, 'Siderophore cephalosporin': 300, Glycopeptide: 160, Lipopeptide: 150, Oxazolidinone: 140, Tetracycline: 45, Aminoglycoside: 15, Fluoroquinolone: 345, Sulfonamide: 60, 'Phosphonic acid': 90, Amphenicol: 30, Nitroimidazole: 185, Macrolide: 115, Polymyxin: 0, Triazole: 190, Echinocandin: 30, Polyene: 330 };
const PRESETS = [
  { title: 'ESBL Enterobacterales', k: 'bacteria', lanes: ['MEM', 'TZP', 'FEP'] },
  { title: 'MRSA bacteraemia', k: 'bacteria', lanes: ['VAN', 'DAP', 'CPT'] },
  { title: 'Carbapenemase CRE', k: 'bacteria', lanes: ['CA', 'AA', 'FDC'] },
  { title: 'Invasive candidiasis', k: 'fungi', lanes: ['MIC', 'FLU', 'LAMB'] },
];
const ICON = {
  overview: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
  spectrum: '<path d="M3 6h12M3 12h18M3 18h9"/><circle cx="18" cy="6" r="2"/><circle cx="15" cy="18" r="2"/>',
  organisms: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><path d="M12 9l2.6 1.5v3L12 15l-2.6-1.5v-3z"/>',
  drugs: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M3 10h18"/>',
  antibiogram: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  advances: '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>',
  sources: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
};
const VIEWS = [
  { id: 'overview', label: 'Overview', sec: 'Reference' },
  { id: 'spectrum', label: 'Spectrum', sec: 'Reference' },
  { id: 'organisms', label: 'Organisms', sec: 'Reference' },
  { id: 'drugs', label: 'Drugs', sec: 'Reference' },
  { id: 'antibiogram', label: 'Antibiogram', sec: 'Your unit' },
  { id: 'advances', label: 'Recent advances', sec: 'Evidence' },
  { id: 'sources', label: 'Sources & review', sec: 'Evidence' },
];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svgIcon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || k}</svg>`;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k, f) { try { const v = localStorage.getItem('abg.' + k); return v == null ? f : JSON.parse(v); } catch { return f; } },
  set(k, v) { try { localStorage.setItem('abg.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem('abg.' + k); } catch { /* storage unavailable */ } },
};

let D = null; // loaded data
const S = {
  view: 'overview', kingdom: store.get('kingdom', 'bacteria'),
  lanes: store.get('lanes', { bacteria: ['TZP', 'MEM'], fungi: ['FLU', 'MIC'], viruses: ['ACY', 'GAN'] }),
  mode: 'reference', localLanes: null, sort: 'coverage',
  org: { bacteria: 'crab', fungi: 'c_auris', viruses: 'cmv' }, colorBy: 'options',
  drug: store.get('drug', 'TZP'), drugFilter: 'all',
  ctx: store.get('ctx', { pop: 'adult', renal: 'Normal', hepatic: 'Normal', site: 'any' }),
  local: store.get('local', null), advFilter: 'all',
};

// ── Data access ────────────────────────────────────────
const drug = (id) => D.drugById[id];
const codeOf = (org, id) => (org.act[id] && RANK[org.act[id]] != null ? org.act[id] : '-');
const rankOf = (org, id) => { const c = codeOf(org, id); return c === '-' ? null : RANK[c]; };
const K = (id) => KINGDOMS.find((k) => k.id === id);
const kOrgs = (k) => K(k).groups.flatMap((g) => D.orgs.filter((o) => o.kingdom === k && o.group === g).sort((a, b) => tierN(a) - tierN(b)));
const tierN = (o) => ({ 'Wild type': 0, MDR: 1, XDR: 2 }[o.tier] ?? 0);
const kDrugs = (k) => D.drugs.filter((d) => d.kingdom === K(k).drugs);
const kingdomOfDrug = (d) => KINGDOMS.find((k) => k.drugs === d.kingdom).id;
const reliableCount = (o) => kDrugs(o.kingdom).filter((d) => (rankOf(o, d.id) ?? 0) >= 3).length;
const siteRule = (drugId, site = S.ctx.site) => D.sites.find((s) => s.id === site)?.rules?.find((r) => r.drug === drugId);
const srcLink = (id) => { const s = D.sources[id]; return s ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.citation)}">${esc(s.publisher.split(' ')[0] === 'U.S.' ? 'FDA label' : shortSrc(id, s))}</a>` : ''; };
const shortSrc = (id, s) => ({ 'idsa-amr-2024': 'IDSA AMR 2024', 'idsa-mrsa-2011': 'IDSA MRSA 2011', 'aha-ie-2015': 'AHA endocarditis 2015', 'ats-idsa-cap-2019': 'ATS/IDSA CAP 2019', 'eucast-expected': 'EUCAST expected phenotypes', 'idsa-iai-2010': 'SIS/IDSA IAI 2010', 'idsa-cdi-2021': 'IDSA/SHEA CDI 2021', 'idsa-candida-2016': 'IDSA candidiasis 2016', 'cdc-cauris': 'CDC C. auris', 'idsa-aspergillus-2016': 'IDSA aspergillosis 2016', 'idsa-crypto-2010': 'IDSA cryptococcal 2010', 'ecmm-mucor-2019': 'ECMM mucormycosis 2019', 'nih-oi': 'NIH/CDC OI guidelines', 'idsa-flu-2018': 'IDSA influenza 2018', 'idsa-covid': 'IDSA COVID-19', 'cdc-sti-2021': 'CDC STI 2021', 'cmv-sot-2018': 'CMV in SOT 2018', 'cdc-rsv': 'CDC RSV', 'who-aware-2023': 'WHO AWaRe 2023', 'who-aware-book-2022': 'WHO AWaRe book', 'clsi-m39': 'CLSI M39' }[id] || s.title);
const dailymed = (d) => `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(d.labelQuery)}`;
const fmtDate = (s) => { if (!s) return ''; const [y, m] = s.split('-'); return m ? new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : y; };
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const awareTag = (d) => d.aware ? `<span class="aware" data-g="${esc(d.aware)}" title="WHO AWaRe 2023"><i></i>${esc(d.aware)}</span>` : '';

// ── Local antibiogram (antibiome export or CSV) ────────
const LOCAL_GP = /staphylococc|enterococc|streptococc|listeria|coagulase|corynebact/i;
const LOCAL_F = /candida|aspergill|cryptococc/i;
function localDrugId(name) {
  const n = name.toLowerCase();
  const hit = D.drugs.filter((d) => d.terms.every((t) => n.includes(t))).sort((a, b) => b.terms.length - a.terms.length)[0];
  return hit?.id ?? null;
}
function parseAntibiogram(text, fileName) {
  const t = text.trim();
  if (t.startsWith('{')) {
    const j = JSON.parse(t);
    const rows = j.rows || j.antibiogram?.rows;
    if (!Array.isArray(rows)) throw new Error('JSON has no "rows" array. Export the antibiogram from Antibiome, or use the CSV layout below.');
    return { unit: j.unit || j.meta?.unit || fileName, period: j.period || j.meta?.period || null, method: j.method || j.meta?.method || (j.duplicatesRemoved != null ? 'First isolate per patient (CLSI M39)' : null), example: !!j.example,
      rows: rows.map((r) => ({ organism: r.organism, isolates: r.isolates ?? null, cells: Object.fromEntries(Object.entries(r.cells || {}).map(([drugName, c]) => [drugName, { n: c.n ?? (c.S + c.I + c.R), pct: c.pctS ?? (c.n ? Math.round((c.S / c.n) * 100) : null) }])) })) };
  }
  const lines = t.split(/\r?\n/).filter(Boolean);
  const head = lines.shift().toLowerCase().split(',').map((h) => h.trim());
  const ix = (k) => head.indexOf(k);
  if (ix('organism') < 0 || ix('drug') < 0) throw new Error('CSV needs a header row with organism and drug columns, plus n and pctS (or S, I, R).');
  const byOrg = new Map();
  lines.forEach((line) => {
    const c = line.split(',').map((x) => x.trim());
    const S_ = +c[ix('s')], I_ = +c[ix('i')], R_ = +c[ix('r')];
    const n = ix('n') >= 0 ? +c[ix('n')] : S_ + I_ + R_;
    const pct = ix('pcts') >= 0 ? +c[ix('pcts')] : (n ? Math.round((S_ / n) * 100) : null);
    if (!byOrg.has(c[ix('organism')])) byOrg.set(c[ix('organism')], {});
    byOrg.get(c[ix('organism')])[c[ix('drug')]] = { n, pct };
  });
  return { unit: fileName, period: null, method: null, rows: [...byOrg].map(([organism, cells]) => ({ organism, isolates: null, cells })) };
}
const pctBucket = (p) => (p == null ? null : p >= 90 ? 'hi' : p >= 80 ? 'mid' : p >= 60 ? 'lo' : 'bad');
function localForOrg(org) {
  if (!S.local) return null;
  const key = org.name.toLowerCase().split(' ').slice(0, 2).join(' ');
  return S.local.rows.find((r) => r.organism.toLowerCase().startsWith(key)) || null;
}
function localCell(row, drugId) {
  if (!row) return null;
  const e = Object.entries(row.cells).find(([n]) => localDrugId(n) === drugId);
  return e ? e[1] : null;
}

// ── Spectrum adapters: reference phenotypes or the unit's own antibiogram ──
function refAdapter(k) {
  const orgs = kOrgs(k);
  return {
    mode: 'reference',
    groups: K(k).groups.map((g) => ({ label: g, n: orgs.filter((o) => o.group === g).length })).filter((g) => g.n),
    cols: orgs.map((o) => ({ id: o.id, label: shortOrg(o), group: o.group, title: `${o.abbr} · ${o.name}`, tier: o.tier })),
    drugs: kDrugs(k).map((d) => ({ key: d.id, code: d.short, name: d.name, d })),
    cell(key, colId) { const o = D.orgById[colId]; const c = codeOf(o, key); return { c, score: c === '-' ? 'x' : Math.min(4, Math.floor(RANK[c] >= 3 ? RANK[c] : RANK[c] >= 2 ? 2 : RANK[c] >= 1.5 ? 1 : 0)), label: D.codes[c] }; },
    covered: (score) => score !== 'x' && score >= 3,
  };
}
function localAdapter() {
  const rows = S.local.rows;
  const grp = (o) => (LOCAL_F.test(o) ? 'Fungi' : LOCAL_GP.test(o) ? 'Gram-positive' : 'Gram-negative');
  const order = ['Gram-positive', 'Gram-negative', 'Fungi'];
  const cols = rows.map((r) => ({ id: r.organism, label: abbrevOrg(r.organism), group: grp(r.organism), title: `${r.organism}${r.isolates ? ` · ${r.isolates} isolates` : ''}` })).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  const names = [...new Set(rows.flatMap((r) => Object.keys(r.cells)))];
  return {
    mode: 'local',
    groups: order.map((g) => ({ label: g, n: cols.filter((c) => c.group === g).length })).filter((g) => g.n),
    cols,
    drugs: names.map((n) => { const id = localDrugId(n); return { key: n, code: id ? drug(id).short : n.slice(0, 4).toUpperCase(), name: n, d: id ? drug(id) : null }; }),
    cell(key, colId) {
      const c = rows.find((r) => r.organism === colId)?.cells[key];
      if (!c || c.pct == null) return { score: 'x', label: 'Not tested' };
      return { pct: c.pct, n: c.n, s: pctBucket(c.pct), score: c.pct >= 90 ? 3 : c.pct >= 80 ? 2 : c.pct >= 60 ? 1 : 0, label: `${c.pct}% susceptible (n=${c.n})` };
    },
    covered: (score) => score !== 'x' && score >= 2,
  };
}
const abbrevOrg = (n) => { const w = n.replace(/\(.*?\)/g, '').trim().split(/\s+/); return w.length > 1 && !/coagulase|viridans/i.test(n) ? `${w[0][0]}. ${w[1].slice(0, 6)}` : n.slice(0, 9); };

// ── Shell ──────────────────────────────────────────────
function renderNav() {
  const secs = [...new Set(VIEWS.map((v) => v.sec))];
  const newCount = countNewAdvances();
  $('#nav').innerHTML = secs.map((sec) => `<div class="nav-sec"><div class="nav-h">${sec}</div>${VIEWS.filter((v) => v.sec === sec).map((v) => {
    const extra = v.id === 'drugs' ? `<span class="count">${D.drugs.length}</span>` : v.id === 'organisms' ? `<span class="count">${D.orgs.length}</span>`
      : v.id === 'advances' && newCount ? `<span class="dot-new" title="New since your last visit">${newCount}</span>` : v.id === 'antibiogram' && S.local ? '<span class="count">loaded</span>' : '';
    return `<a href="#${v.id}" ${S.view === v.id ? 'aria-current="page"' : ''}>${svgIcon(v.id)}${v.label}${extra}</a>`;
  }).join('')}</div>`).join('');
  const rev = D.orgs.filter((o) => o.review.status === 'reviewed').length;
  const dosed = Object.values(D.dosing.drugs).filter((x) => x.status !== 'not-sourced').length;
  $('#side-status').innerHTML = `<div class="row"><span>Data edition</span><b>${esc(D.version)}</b></div>
    <div class="row"><span>Rows reviewed</span><b>${rev}/${D.orgs.length}</b></div>
    <div class="row"><span>Doses sourced</span><b>${dosed}/${D.drugs.length}</b></div>
    <div class="row"><span class="online ${navigator.onLine ? '' : 'off'}" id="online"><i></i>${navigator.onLine ? 'Online' : 'Offline copy'}</span></div>`;
}
function ctxLabel() { const p = POPS.find((x) => x.id === S.ctx.pop).label; const site = D.sites.find((s) => s.id === S.ctx.site).label; return `${p} · Renal ${S.ctx.renal === 'Normal' ? 'normal' : S.ctx.renal} · ${S.ctx.hepatic === 'Normal' ? 'Liver normal' : S.ctx.hepatic} · ${site}`; }
function renderTop() {
  const v = VIEWS.find((x) => x.id === S.view);
  $('#title').textContent = v.label;
  $('#ctx-label').textContent = ctxLabel();
  document.title = `${v.label} · Antibiotogram`;
}

function render() {
  renderNav(); renderTop();
  const fn = { overview: vOverview, spectrum: vSpectrum, organisms: vOrganisms, drugs: vDrugs, antibiogram: vAntibiogram, advances: vAdvances, sources: vSources }[S.view];
  $('#view').innerHTML = fn();
  after[S.view]?.();
}
const after = {};

// ── Overview ───────────────────────────────────────────
function vOverview() {
  const ab = D.drugs.filter((d) => d.kingdom === 'antibacterial');
  const aw = ['Access', 'Watch', 'Reserve'].map((g) => ({ g, n: ab.filter((d) => d.aware?.startsWith(g)).length }));
  const other = ab.length - aw.reduce((s, x) => s + x.n, 0);
  const rev = D.orgs.filter((o) => o.review.status === 'reviewed').length;
  const hardest = D.orgs.filter((o) => o.kingdom !== 'viruses' || reliableCount(o) > 0).map((o) => ({ o, n: reliableCount(o) })).sort((a, b) => a.n - b.n).slice(0, 6);
  const adv = mergedAdvances().slice(0, 5);
  return `
  <div class="kpis">
    <div class="kpi"><span class="kicker">Antimicrobials</span><div class="v">${D.drugs.length}</div><div class="d">${ab.length} antibacterial · ${D.drugs.filter((d) => d.kingdom === 'antifungal').length} antifungal · ${D.drugs.filter((d) => d.kingdom === 'antiviral').length} antiviral</div></div>
    <div class="kpi"><span class="kicker">Organisms and phenotypes</span><div class="v">${D.orgs.length}</div><div class="d">${KINGDOMS.map((k) => `${D.orgs.filter((o) => o.kingdom === k.id).length} ${k.label.toLowerCase()}`).join(' · ')}</div></div>
    <div class="kpi"><span class="kicker">WHO AWaRe mix</span>
      <div class="stackbar" role="img" aria-label="${aw.map((x) => `${x.n} ${x.g}`).join(', ')}">${aw.map((x) => `<i style="flex:${x.n};background:var(--${x.g.toLowerCase()})"></i>`).join('')}<i style="flex:${other};background:var(--line-2)"></i></div>
      <div class="legend-row">${aw.map((x) => `<span class="aware" data-g="${x.g}"><i></i>${x.n} ${x.g}</span>`).join('')}<span class="aware"><i></i>${other} not listed</span></div></div>
    <div class="kpi"><span class="kicker">Evidence review</span><div class="v">${rev}<small>/ ${D.orgs.length} rows</small></div><div class="meter"><i style="width:${(rev / D.orgs.length) * 100}%"></i></div><div class="d">Every row cites its guideline; clinician sign-off is pending. <a href="#sources">See status</a></div></div>
  </div>
  <div class="grid-main">
    <div class="stack">
      <section class="panel"><div class="p-head"><div><h2 class="p-title">Quick compare</h2><p class="p-sub">Open common empiric questions as spectrum bands.</p></div><a class="btn" href="#spectrum">Open Spectrum</a></div>
        <div class="presets">${PRESETS.map((p, i) => `<button type="button" class="preset" data-preset="${i}"><b>${esc(p.title)}</b><span>${p.lanes.map((id) => drug(id).short).join(' · ')}</span></button>`).join('')}</div></section>
      <section class="panel"><div class="p-head"><div><h2 class="p-title">Fewest reliable options</h2><p class="p-sub">Organisms with the fewest drugs rated active or drug of choice in this reference.</p></div></div>
        <div class="rows">${hardest.map(({ o, n }) => `<a href="#organism-${o.id}" style="color:inherit;text-decoration:none"><div><div class="t">${esc(o.abbr)} <span class="pill ${o.tier === 'XDR' ? 'bad' : o.tier === 'MDR' ? 'warn' : ''}">${o.tier}</span></div><div class="s">${esc(o.name)}</div></div><span class="pill ${n <= 2 ? 'bad' : n <= 4 ? 'warn' : ''}">${n} option${n === 1 ? '' : 's'}</span></a>`).join('')}</div></section>
    </div>
    <div class="stack">
      <section class="panel"><div class="p-head"><div><h2 class="p-title">Recent advances</h2><p class="p-sub">${advancesStamp()}</p></div><a class="btn" href="#advances">All</a></div>
        <ul class="feed">${adv.map(feedItem).join('')}</ul></section>
      <section class="panel"><div class="p-head"><h2 class="p-title">Resistance watch</h2></div><div class="stack" style="gap:12px">${D.alerts.map((a) => `<div class="alert ${a.tone === 'danger' ? 'danger' : ''}"><h4>${esc(a.title)}</h4><p>${esc(a.body)}</p></div>`).join('')}</div></section>
      <section class="panel"><div class="p-head"><div><h2 class="p-title">Your antibiogram</h2><p class="p-sub">${S.local ? `${esc(S.local.unit)}${S.local.period ? ` · ${esc(S.local.period.from)} to ${esc(S.local.period.to)}` : ''}` : 'Import an Antibiome export or a CSV to see your unit’s % susceptible next to the reference.'}</p></div><a class="btn ${S.local ? '' : 'primary'}" href="#antibiogram">${S.local ? 'View' : 'Import'}</a></div></section>
    </div>
  </div>`;
}

// ── Spectrum ───────────────────────────────────────────
function lanesFor(ad) {
  if (ad.mode === 'local') { if (!S.localLanes) S.localLanes = ad.drugs.map((d) => ({ k: d.key, n: ad.cols.filter((c) => ad.covered(ad.cell(d.key, c.id).score)).length })).sort((a, b) => b.n - a.n).slice(0, 3).map((x) => x.k); return S.localLanes.filter((k) => ad.drugs.some((d) => d.key === k)); }
  return S.lanes[S.kingdom];
}
function setLanes(next) {
  if (S.mode === 'local') S.localLanes = next; else { S.lanes[S.kingdom] = next; store.set('lanes', S.lanes); }
}
function vSpectrum() {
  if (S.mode === 'local' && !S.local) S.mode = 'reference';
  const ad = S.mode === 'local' ? localAdapter() : refAdapter(S.kingdom);
  const lanes = lanesFor(ad);
  return `
  <section class="panel">
    <div class="toolbar">
      ${S.mode === 'reference' ? `<div class="seg" role="group" aria-label="Kingdom">${KINGDOMS.map((k) => `<button type="button" data-kingdom="${k.id}" aria-pressed="${S.kingdom === k.id}">${k.label}</button>`).join('')}</div>` : `<span class="pill acc">${esc(S.local.unit)}</span>`}
      <div class="seg" role="group" aria-label="Data">${[['reference', 'Reference'], ['local', 'Your antibiogram']].map(([m, l]) => `<button type="button" data-mode="${m}" aria-pressed="${S.mode === m}" ${m === 'local' && !S.local ? 'disabled title="Import an antibiogram first"' : ''}>${l}</button>`).join('')}</div>
      <span class="grow"></span>
      ${S.mode === 'reference' ? `<span class="p-sub" style="margin:0">Site: <b>${esc(D.sites.find((s) => s.id === S.ctx.site).label)}</b> <button type="button" class="btn" data-open-ctx style="height:26px;padding:0 8px;margin-left:4px">Change</button></span>` : ''}
    </div>
  </section>
  <section class="panel">
    <div class="p-head"><div><h2 class="p-title">${lanes.length ? `Comparing ${lanes.length} drug${lanes.length > 1 ? 's' : ''}` : 'Pick drugs to compare'}</h2>
      <p class="p-sub">${ad.mode === 'local' ? 'Each segment is your unit’s % susceptible. Hatched cells have fewer than 30 isolates (CLSI M39).' : 'Organisms run left to right by group; within each group, resistance increases to the right. Add up to four drugs from the list below.'}</p></div>
      ${lanes.length ? '<button type="button" class="btn" data-clear-lanes>Clear</button>' : ''}</div>
    <div class="bands-scroll">${bandsHTML(ad, lanes)}</div>
    ${bandLegend(ad)}
  </section>
  <section class="panel">
    <div class="p-head"><div><h2 class="p-title">All ${ad.mode === 'local' ? 'tested drugs' : K(S.kingdom).drugs + 's'}</h2><p class="p-sub">${lanes.length ? 'Amber cells and the +n column show which organisms each drug adds to your selection.' : 'Tap a row to add it to the comparison.'}</p></div>
      <div class="seg" role="group" aria-label="Sort">${[['coverage', 'Most coverage'], ['fills', 'Fills gaps'], ['class', 'By class']].map(([k, l]) => `<button type="button" data-sort="${k}" aria-pressed="${S.sort === k}">${l}</button>`).join('')}</div></div>
    <div class="drug-list">${drugListHTML(ad, lanes)}</div>
  </section>`;
}
function bandsHTML(ad, lanes, compact = false) {
  const cols = ad.cols, N = cols.length;
  let h = `<div class="bands${compact ? ' compact' : ''}" style="--cols:${N}" ${compact ? '' : 'id="bands"'}><div></div>${ad.groups.map((g) => `<div class="gh" style="grid-column:span ${g.n}" title="${esc(g.label)}">${esc(g.label)}</div>`).join('')}`;
  h += `<div></div>${cols.map((c, i) => `<div class="ch" data-col="${i}" title="${esc(c.title)}"><span>${esc(c.label)}</span></div>`).join('')}`;
  const best = cols.map(() => ({ score: -1 }));
  lanes.forEach((key, li) => {
    const dd = ad.drugs.find((x) => x.key === key); if (!dd) return;
    const rule = ad.mode === 'reference' ? siteRule(key) : null;
    const cells = cols.map((c) => ad.cell(key, c.id));
    cells.forEach((cl, i) => { if (cl.score !== 'x' && cl.score > best[i].score) best[i] = cl; });
    // Reference bands merge neighbouring active cells into one bar; local %S cells stay separate so each number reads on its own.
    const on = cells.map((cl) => ad.mode === 'reference' && cl.score !== 'x' && cl.score >= 1);
    h += `<div class="lane-l"><span class="code">${esc(dd.code)}</span><span class="nm"><b>${esc(dd.name)}</b>${dd.d ? awareTag(dd.d) : ''}${rule ? ` <span class="pill lane-flag ${rule.effect === 'avoid' ? 'bad' : rule.effect === 'caution' ? 'warn' : 'ok'}" title="${esc(rule.note)}">${rule.effect === 'labelled' ? 'Labelled' : rule.effect === 'avoid' ? 'Avoid here' : 'Caution'}</span>` : ''}</span><button type="button" class="x" data-lane-remove="${esc(key)}" aria-label="Remove ${esc(dd.name)}">×</button></div>`;
    h += cells.map((cl, i) => {
      const same = (j) => j >= 0 && j < N && on[j] && cols[j].group === cols[i].group;
      const cls = on[i] ? [same(i - 1) ? 'join-l' : 'run-s', same(i + 1) ? 'join-r' : 'run-e'].join(' ') : '';
      const body = ad.mode === 'local' ? `data-s="${cl.s || ''}"` : `data-c="${cl.c}"`;
      return `<i class="sg ${cls} ${cl.n != null && cl.n < 30 ? 'lown' : ''}" ${body} data-col="${i}" data-tip="${esc(cols[i].title)}|${esc(dd.name)}|${esc(cl.label)}" style="--i:${i + li * 4}">${cl.pct != null ? `<span class="pct">${cl.pct}</span>` : ''}</i>`;
    }).join('');
  });
  if (lanes.length) {
    const cov = best.filter((b) => b.score !== -1 && ad.covered(b.score)).length;
    h += `<div class="div"></div><div class="union-l">Together <span class="n">${cov}/${N}</span></div>`;
    h += best.map((b, i) => {
      const isGap = b.score === -1 || b.score === 'x' || !ad.covered(b.score);
      const attr = ad.mode === 'local' ? `data-s="${b.s || ''}"` : `data-c="${b.c || '-'}"`;
      return `<i class="sg ${isGap ? 'gap' : ''}" ${isGap ? '' : attr} data-col="${i}" data-tip="${esc(cols[i].title)}|Best of selection|${isGap ? 'Gap: no selected drug is reliable' : esc(b.label)}" style="--i:${i}"></i>`;
    }).join('');
  }
  return h + '</div>';
}
function bandLegend(ad) {
  if (ad.mode === 'local') return `<div class="band-legend"><span><i style="background:var(--a-full)"></i>≥ 90% S</span><span><i style="background:var(--a-part)"></i>80–89%</span><span><i style="background:var(--warn-soft);box-shadow:inset 0 0 0 1px var(--warn)"></i>60–79%</span><span><i style="background:var(--bad-soft);box-shadow:inset 0 0 0 1px var(--bad)"></i>&lt; 60%</span><span><i style="background:repeating-linear-gradient(135deg,var(--a-part) 0 3px,var(--panel) 3px 5px)"></i>n &lt; 30</span><span>Source: ${esc(S.local.unit)}</span></div>`;
  return `<div class="band-legend"><span><i style="background:var(--a-doc)"></i>Drug of choice</span><span><i style="background:var(--a-full)"></i>Active</span><span><i style="background:var(--a-part)"></i>Partial</span><span><i style="background:repeating-linear-gradient(135deg,var(--a-part) 0 3px,var(--a-var) 3px 6px)"></i>Variable</span><span><i style="box-shadow:inset 0 0 0 1.5px var(--a-full)"></i>Combination only</span><span><i style="background:var(--a-none)"></i>Not reliable</span><span><i style="box-shadow:inset 0 0 0 1px var(--line-2)"></i>Not assessed</span><span><i style="background:var(--bad-soft);box-shadow:inset 0 0 0 1px var(--bad)"></i>Gap</span></div>`;
}
function drugListHTML(ad, lanes) {
  const cols = ad.cols;
  const gapIdx = new Set(lanes.length ? cols.map((c, i) => i).filter((i) => !lanes.some((k) => { const s = ad.cell(k, cols[i].id).score; return ad.covered(s); })) : []);
  const rows = ad.drugs.map((dd) => {
    const cells = cols.map((c) => ad.cell(dd.key, c.id));
    const cov = cells.filter((c) => ad.covered(c.score)).length;
    const fills = lanes.includes(dd.key) ? 0 : cells.filter((c, i) => gapIdx.has(i) && ad.covered(c.score)).length;
    return { dd, cells, cov, fills };
  });
  rows.sort((a, b) => S.sort === 'fills' ? b.fills - a.fills || a.cov - b.cov : S.sort === 'class' ? String(a.dd.d?.class).localeCompare(String(b.dd.d?.class)) : b.cov - a.cov);
  return rows.map(({ dd, cells, cov, fills }) => {
    let gi = 0;
    const thin = ad.groups.map((g) => { const part = cells.slice(gi, gi + g.n).map((c, j) => `<i data-r="${c.score}" class="${gapIdx.has(gi + j) && ad.covered(c.score) && !lanes.includes(dd.key) ? 'fill' : ''}"></i>`).join(''); gi += g.n; return `<span class="g" style="--n:${g.n}">${part}</span>`; }).join('');
    return `<button type="button" class="dl-row" data-lane-toggle="${esc(dd.key)}" aria-pressed="${lanes.includes(dd.key)}"><span class="code">${esc(dd.code)}</span><span class="nm">${esc(dd.name)}</span><span class="thin" aria-hidden="true">${thin}</span><span class="cnt">${cov}/${cols.length}</span><span class="fills">${fills ? `+${fills}` : ''}</span></button>`;
  }).join('');
}
after.spectrum = () => {
  const bands = $('#bands'); if (!bands) return;
  bands.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-col]'); if (!el) return;
    const i = el.dataset.col;
    $$('.col-hot, .ch.hot', bands).forEach((x) => x.classList.remove('col-hot', 'hot'));
    $$(`.sg[data-col="${i}"]`, bands).forEach((x) => x.classList.add('col-hot'));
    $(`.ch[data-col="${i}"]`, bands)?.classList.add('hot');
    if (el.dataset.tip) { const [a, b, c] = el.dataset.tip.split('|'); showTip(el, `<b>${a}</b><span class="m">${b}</span><br>${c}`); }
  });
  bands.addEventListener('mouseleave', () => { $$('.col-hot, .ch.hot', bands).forEach((x) => x.classList.remove('col-hot', 'hot')); hideTip(); });
};

// ── Organisms (hex map) ────────────────────────────────
const HS = 30, HW = Math.sqrt(3) * HS;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const hpx = (q, r) => [HW * (q + r / 2), HS * 1.5 * r];
function spiral(n) {
  const out = [[0, 0]];
  for (let k = 1; out.length < n; k++) { let q = DIRS[4][0] * k, r = DIRS[4][1] * k; for (let i = 0; i < 6; i++) for (let j = 0; j < k; j++) { out.push([q, r]); q += DIRS[i][0]; r += DIRS[i][1]; } }
  return out.slice(0, n);
}
function hexPts(cx, cy, rad) { let p = ''; for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); p += `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)} `; } return p.trim(); }
function hexSVG(k) {
  const groups = K(k).groups.map((g) => ({ g, orgs: kOrgs(k).filter((o) => o.group === g) })).filter((x) => x.orgs.length);
  const ROW_W = 700;
  let x0 = 0, y0 = 0, rowH = 0, width = 0, html = '';
  const placed = [];
  groups.forEach(({ g, orgs }) => {
    const cells = orgs.length === 2 ? [[0, 0], [1, 0]] : spiral(orgs.length);
    const occ = new Set(cells.map(([q, r]) => q + ',' + r));
    const ring = [];
    cells.forEach(([q, r]) => DIRS.forEach(([dq, dr]) => { const key = (q + dq) + ',' + (r + dr); if (!occ.has(key) && !ring.some((x) => x.key === key)) ring.push({ key, q: q + dq, r: r + dr }); }));
    const all = [...cells, ...ring.map((x) => [x.q, x.r])].map(([q, r]) => hpx(q, r));
    const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0])), minY = Math.min(...all.map((p) => p[1])), maxYc = Math.max(...all.map((p) => p[1]));
    const w = maxX - minX + HW;
    if (x0 > 0 && x0 + w > ROW_W) { x0 = 0; y0 += rowH + 16; rowH = 0; }
    const ox = x0 - minX + HW / 2, oy = y0 - minY + HS + 26;
    rowH = Math.max(rowH, maxYc - minY + HS * 2 + 26);
    html += ring.map(({ q, r }) => { const [x, y] = hpx(q, r); return `<polygon class="hlat" points="${hexPts(x + ox, y + oy, HS - 2.5)}" opacity=".55"/>`; }).join('');
    html += `<text class="clabel" x="${(x0 + 4).toFixed(1)}" y="${y0 + 12}">${esc(g)} · ${orgs.length}</text>`;
    cells.forEach(([q, r], i) => { const [x, y] = hpx(q, r); placed.push({ o: orgs[i], x: x + ox, y: y + oy }); });
    x0 += w + 22; width = Math.max(width, x0 - 22);
  });
  html += placed.map(({ o, x, y }) => `<g class="hx" data-org="${o.id}" tabindex="0" role="button" aria-label="${esc(o.abbr)}" style="--d:${Math.round(x * 0.8 + y * 0.4)}ms"><polygon class="cell" points="${hexPts(x, y, HS - 2.5)}"/><text class="lbl" x="${x}" y="${y - 4}">${esc(shortOrg(o))}</text><text class="sub" x="${x}" y="${y + 9}"></text></g>`).join('');
  const defs = '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" style="fill:var(--a-var)"/><rect width="2.6" height="6" style="fill:var(--a-part)"/></pattern></defs>';
  return `<svg viewBox="0 0 ${Math.max(width, 300).toFixed(0)} ${(y0 + rowH).toFixed(0)}" role="group" aria-label="${esc(K(k).label)} map">${defs}${html}</svg>`;
}
const shortOrg = (o) => ({ e_faecalis: 'E.fcl', vrsa_visa: 'VISA', e_coli: 'E.coli', esbl_e: 'ESBL', kpc_cre: 'KPC', ndm_cre: 'NDM', oxa48_cre: 'OXA48', ecc_mdr: 'ECC', pa: 'PA', mdr_pa: 'MDR-PA', ndm_pa: 'NDM-PA', hflu: 'H.flu', n_gonorrhoeae: 'GC', b_fragilis: 'B.frag', c_diff: 'C.diff', mycoplasma: 'Myco', legionella: 'Legion', c_albicans: 'C.alb', c_glabrata: 'C.glab', c_auris: 'C.auris', aspergillus: 'Asperg', cryptococcus: 'Crypto', mucor: 'Mucor', pcp: 'PJP', influenza: 'Flu', sars_cov2: 'SARS2', hsv: 'HSV', vzv: 'VZV', cmv: 'CMV', ebv_hhv: 'EBV', rsv: 'RSV', steno: 'Steno' }[o.id] || o.abbr);
function vOrganisms() {
  const k = S.kingdom, o = D.orgById[S.org[k]] || kOrgs(k)[0];
  S.org[k] = o.id;
  const ds = kDrugs(k).map((d) => ({ d, c: codeOf(o, d.id), r: rankOf(o, d.id) }));
  const good = ds.filter((x) => x.r != null && x.r >= 1.5).sort((a, b) => b.r - a.r);
  const weak = ds.filter((x) => x.r != null && x.r < 1.5 && x.r > 0);
  const lrow = localForOrg(o);
  return `
  <section class="panel"><div class="toolbar">
    <div class="seg" role="group" aria-label="Kingdom">${KINGDOMS.map((x) => `<button type="button" data-kingdom="${x.id}" aria-pressed="${k === x.id}">${x.label}</button>`).join('')}</div>
    <span class="grow"></span>
    <label class="p-sub" style="margin:0;display:flex;align-items:center;gap:8px" for="colorby">Colour by
      <select class="sel" id="colorby" style="width:auto"><option value="options">Number of reliable options</option>${kDrugs(k).map((d) => `<option value="${d.id}" ${S.colorBy === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
  </div></section>
  <div class="grid-main">
    <section class="panel"><div class="p-head"><div><h2 class="p-title">${esc(K(k).label)} map</h2><p class="p-sub">The wild type sits at the centre of each cluster; resistant phenotypes ring it. Select a hex for detail.</p></div></div>
      <div class="hexmap">${hexSVG(k)}</div>
      <div class="band-legend" id="hex-legend"></div></section>
    <section class="panel stack" style="gap:14px">
      <div class="org-head"><div class="kicker">${esc(o.group)}</div><h2>${esc(o.abbr)}</h2><div class="sci">${esc(o.name)}${o.note ? ` · ${esc(o.note)}` : ''}</div>
        <div class="chips"><span class="pill ${o.tier === 'XDR' ? 'bad' : o.tier === 'MDR' ? 'warn' : ''}">${o.tier}</span>${o.flags.map((f) => `<span class="pill">${esc(f)}</span>`).join('')}<span class="pill ${o.review.status === 'reviewed' ? 'ok' : 'warn'}">${o.review.status === 'reviewed' ? `Reviewed ${esc(o.review.date)}` : 'Clinician review pending'}</span></div></div>
      <p class="mech">${esc(o.mechanism)}</p>
      <div class="src-list"><span class="kicker" style="margin-right:4px">Based on</span>${o.basis.map(srcLink).join('')}</div>
      ${lrow ? `<div class="banner info">${svgIcon('antibiogram')}<div>Your antibiogram has <b>${esc(lrow.organism)}</b>${lrow.isolates ? ` (${lrow.isolates} isolates)` : ''}. Local % susceptible is shown next to each drug.</div></div>` : ''}
      <div><div class="kicker">Reliable or partial options · ${good.length}</div>
        <div class="optlist">${good.map(({ d, c }) => { const lc = localCell(lrow, d.id); return `<button type="button" class="opt" data-goto-drug="${d.id}"><span class="code">${esc(d.short)}</span><span class="nm">${esc(d.name)}${lc ? `<span class="loc">${lc.pct}% S · n=${lc.n}</span>` : ''}</span><span class="act" data-c="${c}">${esc(D.codes[c])}</span></button>`; }).join('') || '<div class="empty">No drug in this reference is rated active.</div>'}</div></div>
      ${weak.length ? `<div><div class="kicker">Combination or limited data</div><div class="optlist">${weak.map(({ d, c }) => `<button type="button" class="opt" data-goto-drug="${d.id}"><span class="code">${esc(d.short)}</span><span class="nm">${esc(d.name)}</span><span class="act" data-c="${c}">${esc(D.codes[c])}</span></button>`).join('')}</div></div>` : ''}
      <div><button type="button" class="btn primary" data-compare-top="${o.id}">Compare top options in Spectrum</button></div>
    </section>
  </div>`;
}
after.organisms = () => {
  paintHex(false);
  $$('.hx').forEach((g) => {
    g.addEventListener('click', () => { S.org[S.kingdom] = g.dataset.org; location.hash = 'organism-' + g.dataset.org; });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.click(); } });
    g.addEventListener('mouseenter', () => { const o = D.orgById[g.dataset.org]; showTip(g, `<b>${esc(o.abbr)}</b><span class="m">${esc(o.name)}</span><br>${S.colorBy === 'options' ? `${reliableCount(o)} reliable options` : `${esc(drug(S.colorBy).short)}: ${esc(D.codes[codeOf(o, S.colorBy)])}`}`); });
    g.addEventListener('mouseleave', hideTip);
  });
  $('#colorby').addEventListener('change', (e) => { S.colorBy = e.target.value; paintHex(true); });
};
function paintHex(animate) {
  $$('.hx').forEach((g) => {
    const o = D.orgById[g.dataset.org];
    g.classList.toggle('sel', o.id === S.org[S.kingdom]);
    if (S.colorBy === 'options' || !drug(S.colorBy) || kingdomOfDrug(drug(S.colorBy)) !== S.kingdom) {
      const n = reliableCount(o); delete g.dataset.c; g.dataset.o = n <= 1 ? 0 : n <= 3 ? 1 : n <= 6 ? 2 : 3;
      $('.sub', g).textContent = n;
    } else { delete g.dataset.o; g.dataset.c = codeOf(o, S.colorBy); $('.sub', g).textContent = ''; }
    if (animate && !RM) g.animate([{ transform: 'scale(.8)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 520, delay: parseFloat(g.style.getPropertyValue('--d')) || 0, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
  $('#hex-legend').innerHTML = S.colorBy === 'options' || !drug(S.colorBy)
    ? '<span><i style="background:var(--bad)"></i>0–1 options</span><span><i style="background:var(--warn)"></i>2–3</span><span><i style="background:var(--a-part)"></i>4–6</span><span><i style="background:var(--a-full)"></i>7 or more</span><span>Number inside = reliable options</span>'
    : bandLegend({ mode: 'reference' }).replace(/^<div class="band-legend">|<\/div>$/g, '');
}

// ── Drugs ──────────────────────────────────────────────
const DRUG_FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'antibacterial', label: 'Antibacterials', test: (d) => d.kingdom === 'antibacterial' },
  { key: 'antifungal', label: 'Antifungals', test: (d) => d.kingdom === 'antifungal' },
  { key: 'antiviral', label: 'Antivirals', test: (d) => d.kingdom === 'antiviral' },
  { key: 'Access', label: 'AWaRe Access', test: (d) => d.aware === 'Access' },
  { key: 'Reserve', label: 'AWaRe Reserve', test: (d) => d.aware === 'Reserve' },
  { key: 'oral', label: 'Oral', test: (d) => /PO/.test(d.route) },
];
function fingerprint(d) {
  const k = kingdomOfDrug(d);
  return `<span class="fp" aria-hidden="true">${K(k).groups.map((g) => `<span class="fp-g">${kOrgs(k).filter((o) => o.group === g).map((o) => { const r = rankOf(o, d.id); return `<i data-r="${r == null ? 'x' : r >= 4 ? 4 : r >= 3 ? 3 : r >= 2 ? 2 : r >= 1.5 ? 1 : 0}"></i>`; }).join('')}</span>`).join('')}</span>`;
}
function vDrugs() {
  const f = DRUG_FILTERS.find((x) => x.key === S.drugFilter);
  const list = D.drugs.filter(f.test);
  const d = drug(S.drug) || D.drugs[0];
  const k = kingdomOfDrug(d), orgs = kOrgs(k);
  const rel = orgs.filter((o) => (rankOf(o, d.id) ?? 0) >= 3).length;
  const note = D.notes[d.id];
  const rules = D.sites.flatMap((s) => (s.rules || []).filter((r) => r.drug === d.id).map((r) => ({ ...r, site: s.label })));
  const combos = D.combos.filter((c) => c.drugs.includes(d.id));
  const ds = D.dosing.drugs[d.id];
  return `
  <section class="panel">
    <div class="toolbar"><div class="chips" role="group" aria-label="Filter">${DRUG_FILTERS.map((x) => `<button type="button" class="chip" data-dfilter="${x.key}" aria-pressed="${S.drugFilter === x.key}">${x.label}</button>`).join('')}</div><span class="grow"></span>
      <button class="btn" type="button" data-rail="-1" aria-label="Scroll cards left">‹</button><button class="btn" type="button" data-rail="1" aria-label="Scroll cards right">›</button></div>
    <div class="rail" id="rail" tabindex="0">${list.map((x) => {
      const r = kOrgs(kingdomOfDrug(x)).filter((o) => (rankOf(o, x.id) ?? 0) >= 3).length;
      return `<button type="button" class="dcard" data-goto-drug="${x.id}" aria-pressed="${x.id === d.id}" style="--h:${CLASS_HUE[x.class] ?? 215}" aria-label="${esc(x.name)}, ${esc(x.class)}">
        <span class="dc-top"><span class="dc-class">${esc(x.class)}</span><span class="dc-route">${esc(x.route.replace(' (IV availability varies)', ''))}</span></span>
        <span class="dc-mid"><span class="dc-code">${esc(x.short)}${x.aware ? `<span class="aware" data-g="${esc(x.aware)}"><i></i></span>` : ''}</span><span class="dc-name">${esc(x.name)}</span></span>
        <span class="dc-foot">${fingerprint(x)}<span class="dc-count"><b>${r}</b>/${kOrgs(kingdomOfDrug(x)).length}</span></span></button>`;
    }).join('') || '<div class="empty">No drugs match this filter.</div>'}</div>
  </section>
  <section class="panel">
    <div class="drug-head"><div><div class="kicker">${esc(d.class)} · ${esc(d.kingdom)}</div><h2>${esc(d.name)}</h2>
      <div class="meta"><span>Route: <b>${esc(d.route)}</b></span>${awareTag(d)}${d.legacy ? '<span class="pill">Legacy return</span>' : ''}<span>Reliable against <b>${rel}/${orgs.length}</b> ${esc(K(k).label.toLowerCase())} in this reference</span></div></div>
      <div class="actions"><a class="btn" href="${dailymed(d)}" target="_blank" rel="noopener noreferrer">FDA label (DailyMed)</a>${d.kingdom === 'antibacterial' ? `<a class="btn" href="${D.sources['who-aware-book-2022'].url}" target="_blank" rel="noopener noreferrer">WHO AWaRe book</a>` : ''}<button class="btn primary" type="button" data-add-lane="${d.id}">Add to Spectrum</button></div></div>
  </section>
  <div class="grid-main">
    <div class="stack">
      <section class="panel"><div class="p-head"><div><h2 class="p-title">Dosing</h2><p class="p-sub">Highlighted row: ${esc(POPS.find((p) => p.id === S.ctx.pop).label)}, renal ${esc(S.ctx.renal)}, hepatic ${esc(S.ctx.hepatic)}. <button type="button" class="btn" data-open-ctx style="height:24px;padding:0 8px">Change</button></p></div></div>
        ${ds.status === 'not-sourced' ? `<div class="banner warn" style="margin-bottom:12px">${svgIcon('<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>')}<div><b>Doses not yet sourced for ${esc(d.name)}.</b> Each line will be copied from the FDA label${d.kingdom === 'antibacterial' ? ' or the WHO AWaRe book' : ''} with its section and revision date, and checked by a clinician. Until then, use the label or your local formulary.</div></div>` : ''}
        ${ds.status !== 'not-sourced' ? `<div class="banner info" style="margin-bottom:12px">${svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>')}<div>Copied from the cited source and re-checked line by line against it${D.dosing.extractedOn ? ` (${esc(D.dosing.extractedOn)})` : ''}. <b>Clinician review: ${ds.reviewedBy ? `${esc(ds.reviewedBy)}, ${esc(ds.reviewedOn)}` : 'pending'}.</b> Confirm against the current label or your formulary before prescribing.${ds.gaps ? `<br><span class="p-sub" style="max-width:none">${esc(ds.gaps)}</span>` : ''}</div></div>` : ''}
        <div class="table-scroll"><table class="dose-table"><thead><tr><th>Population</th><th>Dose</th><th>Source</th></tr></thead><tbody>
        ${POPS.map((p) => `<tr class="${S.ctx.pop === p.id ? 'cur' : ''}"><td><b>${p.label}</b><br><span class="p-sub">${p.range}</span></td>${doseCells(ds[p.id], ds.status)}</tr>`).join('')}
        </tbody></table></div>
        ${[['Kidney function', 'renal', RENAL, S.ctx.renal], ['Liver function', 'hepatic', HEPATIC.slice(1), S.ctx.hepatic]].map(([title, key, bands, cur]) => {
          const rows = bands.filter((b) => ds[key]?.[b]);
          return `<h3 class="kicker" style="margin:18px 0 6px">${title}${key === 'renal' ? ' · as stated in the label, usually for adults' : ''}</h3>${rows.length ? `<div class="table-scroll"><table class="dose-table"><tbody>${rows.map((b) => `<tr class="${cur === b ? 'cur' : ''}"><td><b>${esc(b)}</b></td>${doseCells(ds[key][b], ds.status)}</tr>`).join('')}</tbody></table></div>` : `<p class="p-sub">${ds.status === 'not-sourced' ? 'Not yet sourced.' : 'The sources give no adjustment by band for this drug.'}</p>`}`;
        }).join('')}
      </section>
      <section class="panel"><div class="p-head"><div><h2 class="p-title">Spectrum</h2><p class="p-sub">${esc(K(k).label)} in this reference, grouped as in the Spectrum view.</p></div></div>
        <div class="bands-scroll">${bandsHTML(refAdapter(k), [d.id], true)}</div></section>
      ${rules.length ? `<section class="panel"><div class="p-head"><h2 class="p-title">Site of infection</h2></div>${rules.map((r) => `<div class="rule"><span class="site">${esc(r.site)}</span><span class="pill ${r.effect === 'avoid' ? 'bad' : r.effect === 'caution' ? 'warn' : 'ok'}">${r.effect === 'labelled' ? 'Labelled' : r.effect === 'avoid' ? 'Avoid' : 'Caution'}</span><span style="flex:1">${esc(r.note)} <span class="src-list" style="display:inline">${srcLink(r.source)}</span></span></div>`).join('')}</section>` : ''}
    </div>
    <div class="stack">
      ${note ? `<section class="panel"><div class="p-head"><div><h2 class="p-title">Teaching notes</h2><p class="p-sub">${esc(D.notesMeta.status)}</p></div></div><div class="notes"><div class="note"><h4>${esc(note.tagline)}</h4><p>${esc(note.summary)}</p></div><div class="note"><h4>When it shines</h4><p>${esc(note.shines)}</p></div><div class="note trap"><h4>Common trap</h4><p>${esc(note.trap)}</p></div></div></section>` : ''}
      ${combos.length ? `<section class="panel"><div class="p-head"><div><h2 class="p-title">Known combinations</h2><p class="p-sub">Teaching commentary.</p></div></div><div class="notes">${combos.map((c) => `<div class="note"><h4>${esc(c.title)} · ${esc(c.kind)}</h4><p>${esc(c.body)}</p></div>`).join('')}</div></section>` : ''}
      <section class="panel"><div class="p-head"><div><h2 class="p-title">Literature · ${esc(d.short)}</h2><p class="p-sub"><span class="status" id="lit-status" data-s="loading"><i></i><span>Checking PubMed…</span></span></p></div><button class="btn" type="button" id="lit-refresh">${svgIcon('<path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/>')}Check now</button></div>
        <ul class="feed" id="lit"></ul></section>
    </div>
  </div>`;
}
function doseCells(e, status) {
  if (!e) return `<td><span class="ns">${status === 'not-sourced' ? 'Not yet sourced' : 'Not stated in the sources'}</span></td><td><span class="ns">—</span></td>`;
  const url = e.source === 'fda-labels' && e.label ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(e.label)}` : D.sources[e.source]?.url;
  const name = e.source === 'fda-labels' ? 'FDA label' : 'WHO AWaRe book';
  return `<td>${esc(e.text)}${e.indication ? `<br><span class="p-sub">${esc(e.indication)}</span>` : ''}${e.quote ? `<details class="quote"><summary>Source text</summary><q>${esc(e.quote)}</q></details>` : ''}</td>
    <td><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${name}</a><br><span class="p-sub">${esc(e.section)}${e.version ? ` · ${esc(e.version)}` : ''}</span></td>`;
}
after.drugs = () => {
  const rail = $('#rail'); const sel = $('.dcard[aria-pressed="true"]', rail);
  if (sel) rail.scrollLeft = sel.offsetLeft - rail.clientWidth / 2 + sel.clientWidth / 2;
  let drag = null;
  rail.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') drag = { x: e.clientX, s: rail.scrollLeft, moved: false }; });
  rail.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x; if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; rail.classList.add('dragging'); } if (drag.moved) rail.scrollLeft = drag.s - dx; });
  const end = () => { if (drag?.moved) setTimeout(() => rail.classList.remove('dragging'), 0); drag = null; };
  rail.addEventListener('pointerup', end); rail.addEventListener('pointerleave', end);
  $('#lit-refresh').addEventListener('click', () => loadLiterature(true));
  loadLiterature(false);
};

// Live PubMed per drug, cached for 6 hours and re-checked automatically.
const TTL = 6 * 3600e3;
const pubmedTerm = (d) => `(${d.terms.map((t) => `${t}*[tiab]`).join(' AND ')}) AND (resistan*[tiab] OR trial[tiab] OR guideline[tiab] OR susceptib*[tiab])`;
async function fetchLit(d) {
  const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
  const s = await fetch(`${base}esearch.fcgi?db=pubmed&retmode=json&retmax=6&term=${encodeURIComponent(pubmedTerm(d))}`);
  if (!s.ok) throw new Error('search ' + s.status);
  const ids = (await s.json()).esearchresult?.idlist || [];
  if (!ids.length) return [];
  const m = await fetch(`${base}esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`);
  if (!m.ok) throw new Error('summary ' + m.status);
  const res = (await m.json()).result || {};
  return ids.map((id) => res[id]).filter(Boolean).map((a) => ({ id: a.uid, title: a.title, journal: a.source, date: (a.pubdate || '').split(' ').slice(0, 2).join(' '), authors: (a.authors || []).slice(0, 2).map((x) => x.name).join(', ') + ((a.authors || []).length > 2 ? ' et al.' : '') }));
}
let litSeq = 0;
async function loadLiterature(force) {
  const d = drug(S.drug); if (!d || !$('#lit')) return;
  const key = 'pm.' + d.id, cached = store.get(key, null), seq = ++litSeq;
  const status = (s, t) => { const el = $('#lit-status'); if (el) { el.dataset.s = s; el.lastElementChild.textContent = t; } };
  const draw = (items) => {
    const known = new Set(store.get('pmseen.' + d.id, []));
    $('#lit').innerHTML = items.length ? items.map((a, i) => `<li class="item" style="--d:${i * 40}ms"><span class="when">${esc(a.date)}</span><div><span class="src">${esc(a.journal)}</span>${known.size && !known.has(a.id) ? '<span class="new">NEW</span>' : ''}<a class="t" href="https://pubmed.ncbi.nlm.nih.gov/${a.id}/" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a><p>${esc(a.authors)}</p></div></li>`).join('') : '<li class="empty">No recent PubMed results.</li>';
    store.set('pmseen.' + d.id, items.map((a) => a.id));
  };
  const offline = () => `<li class="empty">PubMed can’t be reached from here. <a href="https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(pubmedTerm(d))}&sort=date" target="_blank" rel="noopener noreferrer">Open the search on PubMed</a>.</li>`;
  if (cached && !force && Date.now() - cached.t < TTL) { draw(cached.items); status('cached', `Up to date · checked ${ago(cached.t)}`); return; }
  status('loading', 'Checking PubMed…'); $('#lit-refresh')?.classList.add('spin');
  try {
    const items = await fetchLit(d); if (seq !== litSeq) return;
    store.set(key, { t: Date.now(), items }); draw(items); status('live', 'Live · checked just now');
  } catch {
    if (seq !== litSeq) return;
    if (cached) { draw(cached.items); status('offline', `Offline · results from ${ago(cached.t)}`); } else { $('#lit').innerHTML = offline(); status('offline', 'Live feed unavailable'); }
  } finally { if (seq === litSeq) $('#lit-refresh')?.classList.remove('spin'); }
}
setInterval(() => { if (S.view === 'drugs') { const c = store.get('pm.' + S.drug, null); if (!c || Date.now() - c.t > TTL) loadLiterature(false); } }, 10 * 60e3);

// ── Antibiogram ────────────────────────────────────────
function vAntibiogram() {
  const L = S.local;
  const drugs = L ? [...new Set(L.rows.flatMap((r) => Object.keys(r.cells)))] : [];
  return `
  ${L?.example ? `<div class="banner warn">${svgIcon('<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>')}<div><b>Example data.</b> These numbers are illustrative and do not come from any real unit. Import your own antibiogram to replace them.</div></div>` : ''}
  <div class="grid-main">
    <section class="panel">${L ? `
      <div class="p-head"><div><h2 class="p-title">${esc(L.unit)}</h2><p class="p-sub">${L.period ? `${esc(L.period.from)} to ${esc(L.period.to)} · ` : ''}${L.rows.length} organisms · ${drugs.length} drugs${L.method ? ` · ${esc(L.method)}` : ''}</p></div>
        <div class="chips"><button class="btn" type="button" data-mode-local>Open in Spectrum</button><button class="btn" type="button" data-clear-local>Remove</button></div></div>
      <div class="table-scroll"><table class="abg"><thead><tr><th></th>${drugs.map((n) => `<th title="${esc(n)}">${esc(n.replace(/\s*\(.*\)/, ''))}</th>`).join('')}</tr></thead><tbody>
      ${L.rows.map((r) => `<tr><th>${esc(r.organism)}${r.isolates ? ` <span class="p-sub">${r.isolates}</span>` : ''}</th>${drugs.map((n) => { const c = r.cells[n]; return c && c.pct != null ? `<td data-s="${pctBucket(c.pct)}" class="${c.n < 30 ? 'lown' : ''}" title="${esc(r.organism)} · ${esc(n)}: ${c.pct}% S, n=${c.n}">${c.pct}<small>n=${c.n}</small></td>` : '<td>–</td>'; }).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="band-legend"><span><i style="background:var(--a-full)"></i>≥ 90% S</span><span><i style="background:var(--a-part)"></i>80–89%</span><span><i style="background:var(--warn-soft)"></i>60–79%</span><span><i style="background:var(--bad-soft)"></i>&lt; 60%</span><span>Hatched: n &lt; 30, interpret with caution (CLSI M39)</span></div>` : `
      <div class="p-head"><div><h2 class="p-title">Import your unit’s antibiogram</h2><p class="p-sub">Your file stays in this browser. Nothing is uploaded.</p></div></div>
      <label class="drop" id="drop" for="abg-file">${svgIcon('antibiogram')}<span><b>Drop a file here</b> or choose one</span><span class="p-sub">Antibiome antibiogram export (.json) or CSV</span><input id="abg-file" type="file" accept=".json,.csv,application/json,text/csv" class="sr"></label>
      <p class="p-sub" style="margin-top:12px">No file yet? <button type="button" class="btn" data-load-example style="height:26px">Load example data</button></p>
      <p class="p-sub" id="abg-err" role="alert" style="color:var(--bad)"></p>`}
    </section>
    <div class="stack">
      <section class="panel"><div class="p-head"><h2 class="p-title">Works with Antibiome</h2></div>
        <p class="p-sub" style="max-width:none">Antibiome PICU builds a first-isolate cumulative antibiogram (CLSI M39) from your unit’s cultures. Export it as JSON and import it here: the site shows % susceptible beside the reference coverage on Spectrum, Organisms and drug pages. Patient data never leaves Antibiome; the export holds only counts.</p>
        <div class="src-list" style="margin-top:10px">${srcLink('clsi-m39')}</div></section>
      <section class="panel"><details><summary>File formats</summary>
        <p class="p-sub" style="max-width:none">JSON (Antibiome export):</p>
        <div class="code-block">{
  "unit": "PICU, City Hospital",
  "period": { "from": "2025-01-01", "to": "2025-12-31" },
  "method": "First isolate per patient (CLSI M39)",
  "rows": [
    { "organism": "Klebsiella pneumoniae", "isolates": 52,
      "cells": { "Meropenem": { "S": 30, "I": 2, "R": 20, "n": 52, "pctS": 58 } } }
  ]
}</div>
        <p class="p-sub" style="max-width:none">CSV, one row per organism and drug:</p>
        <div class="code-block">organism,drug,n,pctS
Klebsiella pneumoniae,Meropenem,52,58
Escherichia coli,Ceftriaxone,88,41</div></details></section>
    </div>
  </div>`;
}
after.antibiogram = () => {
  const input = $('#abg-file'), drop = $('#drop');
  if (!input) return;
  const take = async (file) => {
    try { S.local = parseAntibiogram(await file.text(), file.name.replace(/\.(json|csv)$/i, '')); store.set('local', S.local); S.localLanes = null; render(); }
    catch (e) { $('#abg-err').textContent = `Couldn’t read that file. ${e.message}`; }
  };
  input.addEventListener('change', () => input.files[0] && take(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && take(e.dataTransfer.files[0]));
};

// ── Advances ───────────────────────────────────────────
function mergedAdvances() {
  const cur = D.curated.map((c) => ({ ...c, reviewed: true }));
  const auto = (D.advances?.items || []).map((a) => ({ ...a, body: [a.journal, a.authors].filter(Boolean).join(' · ') }));
  return [...cur, ...auto].sort((a, b) => b.date.localeCompare(a.date));
}
function advancesStamp() { return D.advances?.generated ? `Literature refreshed weekly · last run ${ago(Date.parse(D.advances.generated))}` : 'Literature feed not generated yet'; }
let seenAdv = null;
function countNewAdvances() {
  if (!seenAdv) { seenAdv = store.get('seenAdv', null); if (!seenAdv) { seenAdv = mergedAdvances().map((a) => a.id); store.set('seenAdv', seenAdv); } seenAdv = new Set(seenAdv); }
  return mergedAdvances().filter((a) => !seenAdv.has(a.id)).length;
}
function feedItem(a, i = 0) {
  return `<li class="item" style="--d:${i * 30}ms"><span class="when">${esc(fmtDate(a.date))}</span><div><span class="src">${esc(a.source)}</span><span class="src">${esc(a.kind)}</span>${seenAdv && !seenAdv.has(a.id) ? '<span class="new">NEW</span>' : ''}
    <a class="t" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)}</a>${a.body ? `<p>${esc(a.body)}</p>` : ''}
    ${a.drugs?.length ? `<div class="tags">${a.drugs.filter(drug).map((id) => `<button type="button" class="tagb" data-goto-drug="${id}">${esc(drug(id).short)}</button>`).join('')}</div>` : ''}</div></li>`;
}
function vAdvances() {
  const F = [['all', 'All'], ['antibacterial', 'Antibacterial'], ['antifungal', 'Antifungal'], ['antiviral', 'Antiviral']];
  const kOk = (a) => S.advFilter === 'all' || a.kingdom === S.advFilter || (a.drugs || []).some((id) => drug(id)?.kingdom === S.advFilter);
  const cur = D.curated.filter(kOk), lit = (D.advances?.items || []).filter(kOk);
  const fails = D.advances?.failures?.length ? ` · ${D.advances.failures.length} source unavailable on last run` : '';
  setTimeout(() => store.set('seenAdv', mergedAdvances().map((a) => a.id)), 5000);
  return `
  <section class="panel"><div class="toolbar"><div class="seg" role="group" aria-label="Filter">${F.map(([k, l]) => `<button type="button" data-adv="${k}" aria-pressed="${S.advFilter === k}">${l}</button>`).join('')}</div><span class="grow"></span>
    <span class="status" data-s="${D.advances ? 'cached' : 'offline'}"><i></i>${esc(advancesStamp())}${esc(fails)}</span></div></section>
  <div class="grid-2">
    <section class="panel"><div class="p-head"><div><h2 class="p-title">Approvals and guidance</h2><p class="p-sub">Checked by the editors before they appear here.</p></div></div><ul class="feed">${cur.map(feedItem).join('') || '<li class="empty">Nothing in this group yet.</li>'}</ul></section>
    <section class="panel"><div class="p-head"><div><h2 class="p-title">New evidence</h2><p class="p-sub">Guidelines, randomised trials, meta-analyses and systematic reviews from PubMed that name a drug in this app. Added automatically each week; not reviewed.</p></div></div><ul class="feed">${lit.map(feedItem).join('') || '<li class="empty">No items in this group from the last run.</li>'}</ul></section>
  </div>`;
}

// ── Sources & review ───────────────────────────────────
function vSources() {
  const rev = D.orgs.filter((o) => o.review.status === 'reviewed').length;
  const withBasis = D.orgs.filter((o) => o.basis.length).length;
  const dosed = Object.values(D.dosing.drugs).filter((x) => x.status !== 'not-sourced').length;
  const rules = D.sites.reduce((n, s) => n + (s.rules?.length || 0), 0);
  const row = (name, file, done, total, note) => `<tr><td><b>${name}</b><br><code class="mono p-sub">${file}</code></td><td>${done}/${total}<div class="meter"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div></td><td class="p-sub">${note}</td></tr>`;
  return `
  <div class="banner info">${svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>')}<div><b>For education and decision support.</b> Coverage is a population-level summary; it does not replace culture results, your local antibiogram, the product label or specialist advice.</div></div>
  <section class="panel"><div class="p-head"><div><h2 class="p-title">Dataset status</h2><p class="p-sub">What is sourced, what has been checked by a clinician, and what is still missing.</p></div><a class="btn" href="https://github.com/itskaero/antibiotogram/issues/new?title=Data%20correction%3A%20&body=Item%3A%0ASource%20and%20section%3A%0AWhat%20should%20change%3A" target="_blank" rel="noopener noreferrer">Report a data error</a></div>
    <div class="table-scroll"><table class="ds-table"><thead><tr><th>Dataset</th><th>Progress</th><th>Notes</th></tr></thead><tbody>
      ${row('Coverage rows: guideline mapped', 'data/organisms.json', withBasis, D.orgs.length, 'Each row lists the guideline or reference it follows.')}
      ${row('Coverage rows: clinician reviewed', 'data/organisms.json', rev, D.orgs.length, 'A reviewer checks every cell against the cited source and records name and date.')}
      ${row('Dosing: sourced', 'data/dosing.json', dosed, D.drugs.length, 'Neonate, infant, child and adult, with renal and hepatic bands, from FDA labels and the WHO AWaRe book.')}
      ${row('Site-of-infection rules', 'data/sites.json', rules, rules, 'Only statements made directly in a label or guideline.')}
      ${row('AWaRe group', 'data/drugs.json', D.drugs.filter((d) => d.aware && d.aware !== 'Not listed').length, D.drugs.filter((d) => d.kingdom === 'antibacterial').length, 'WHO 2023 list. Drugs approved after it show “Not listed”.')}
    </tbody></table></div></section>
  <div class="grid-2">
    <section class="panel"><div class="p-head"><h2 class="p-title">References</h2></div>${Object.entries(D.sources).map(([id, s]) => `<div class="src-card"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><span>${esc(s.citation)} · ${esc(s.publisher)}</span><code>${id}</code></div>`).join('')}</section>
    <section class="panel stack" style="gap:12px"><div class="p-head" style="margin:0"><h2 class="p-title">How the data is kept current</h2></div>
      <div class="note"><h4>Activity codes</h4><p>${Object.entries(D.codes).map(([c, l]) => `<b class="mono">${esc(c)}</b> ${esc(l)}`).join(' · ')}. A blank cell means not assessed, never “inactive”.</p></div>
      <div class="note"><h4>Review</h4><p>Edits go through pull requests. A row is marked reviewed only when a named clinician has checked it against the cited source.</p></div>
      <div class="note"><h4>Weekly update</h4><p>A GitHub Action runs every Monday, fetches new guidelines, trials and reviews from PubMed and FDA press releases, and commits <code class="mono">data/advances.json</code>. Approvals and guidance are added by hand.</p></div>
      <div class="note"><h4>Offline</h4><p>The site installs as an app and keeps the last downloaded data for use without a connection.</p></div>
    </section>
  </div>`;
}

// ── Context popover, palette, tooltip ─────────────────
function openCtx(anchor) {
  closeLayers();
  const r = anchor.getBoundingClientRect();
  const pop = document.createElement('div'); pop.className = 'pop'; pop.id = 'ctx-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Patient context');
  const segs = (key, opts) => `<div class="seg">${opts.map((o) => `<button type="button" data-ctx="${key}" data-v="${esc(o.id ?? o)}" aria-pressed="${S.ctx[key] === (o.id ?? o)}">${esc(o.label ?? o)}</button>`).join('')}</div>`;
  pop.innerHTML = `<h3>Patient context</h3>
    <label class="field"><span>Population</span>${segs('pop', POPS)}</label>
    <label class="field" for="ctx-renal"><span>Kidney function</span><select class="sel" id="ctx-renal">${RENAL.map((x) => `<option ${S.ctx.renal === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="field" for="ctx-hep"><span>Liver function</span><select class="sel" id="ctx-hep">${HEPATIC.map((x) => `<option ${S.ctx.hepatic === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="field" for="ctx-site"><span>Site of infection</span><select class="sel" id="ctx-site">${D.sites.map((s) => `<option value="${s.id}" ${S.ctx.site === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
    <p class="hint">Highlights the matching dosing row and flags drugs whose label or guideline speaks to this site. Stored only in this browser.</p>`;
  document.body.append(pop);
  pop.style.top = Math.min(r.bottom + 8, innerHeight - pop.offsetHeight - 16) + 'px';
  pop.style.left = Math.max(16, Math.min(r.right - pop.offsetWidth, innerWidth - pop.offsetWidth - 16)) + 'px';
  const save = () => { store.set('ctx', S.ctx); render(); };
  pop.addEventListener('click', (e) => { const b = e.target.closest('[data-ctx]'); if (!b) return; S.ctx[b.dataset.ctx] = b.dataset.v; $$(`[data-ctx="${b.dataset.ctx}"]`, pop).forEach((x) => x.setAttribute('aria-pressed', x === b)); save(); });
  $('#ctx-renal', pop).addEventListener('change', (e) => { S.ctx.renal = e.target.value; save(); });
  $('#ctx-hep', pop).addEventListener('change', (e) => { S.ctx.hepatic = e.target.value; save(); });
  $('#ctx-site', pop).addEventListener('change', (e) => { S.ctx.site = e.target.value; save(); });
  setTimeout(() => document.addEventListener('click', outside), 0);
  function outside(e) { if (!pop.contains(e.target) && !e.target.closest('[data-open-ctx]')) { pop.remove(); document.removeEventListener('click', outside); } }
}
function openPalette() {
  closeLayers();
  const items = [
    ...VIEWS.map((v) => ({ k: 'View', t: v.label, go: v.id })),
    ...D.drugs.map((d) => ({ k: d.short, t: d.name, ty: d.class, go: 'drug-' + d.id })),
    ...D.orgs.map((o) => ({ k: shortOrg(o), t: `${o.abbr} · ${o.name}`, ty: o.group, go: 'organism-' + o.id })),
  ];
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.id = 'scrim';
  const p = document.createElement('div'); p.className = 'palette'; p.id = 'palette'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Search');
  p.innerHTML = '<input id="pal-q" placeholder="Search drugs, organisms, pages" autocomplete="off" aria-label="Search"><ul id="pal-list" role="listbox"></ul>';
  document.body.append(scrim, p);
  let sel = 0, shown = [];
  const draw = () => {
    const q = $('#pal-q').value.trim().toLowerCase();
    shown = (q ? items.filter((i) => `${i.k} ${i.t} ${i.ty || ''}`.toLowerCase().includes(q)) : items.slice(0, 12)).slice(0, 30);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    $('#pal-list').innerHTML = shown.map((i, n) => `<li><button type="button" role="option" aria-selected="${n === sel}" data-pal="${i.go}"><span class="k">${esc(i.k)}</span><span class="t">${esc(i.t)}</span><span class="ty">${esc(i.ty || '')}</span></button></li>`).join('') || '<li class="empty" style="padding:12px">No matches.</li>';
  };
  const go = (to) => { closeLayers(); location.hash = to; };
  $('#pal-q').addEventListener('input', () => { sel = 0; draw(); });
  $('#pal-q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && shown[sel]) go(shown[sel].go);
  });
  p.addEventListener('click', (e) => { const b = e.target.closest('[data-pal]'); if (b) go(b.dataset.pal); });
  scrim.addEventListener('click', closeLayers);
  draw(); $('#pal-q').focus();
}
function closeLayers() { ['#palette', '#scrim', '#ctx-pop'].forEach((s) => $(s)?.remove()); $('#side').classList.remove('open'); }
function showTip(el, html) {
  const t = $('#tip'); t.innerHTML = html; t.classList.add('on');
  const r = el.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left + r.width / 2 - t.offsetWidth / 2, innerWidth - t.offsetWidth - 8));
  let top = r.top - t.offsetHeight - 8; if (top < 8) top = r.bottom + 8;
  t.style.left = left + 'px'; t.style.top = top + 'px';
}
function hideTip() { $('#tip').classList.remove('on'); }

// ── Routing & events ───────────────────────────────────
function route() {
  const h = decodeURIComponent(location.hash.slice(1)) || 'overview';
  if (h.startsWith('drug-') && D.drugById[h.slice(5)]) { S.view = 'drugs'; S.drug = h.slice(5); store.set('drug', S.drug); }
  else if (h.startsWith('organism-') && D.orgById[h.slice(9)]) { const o = D.orgById[h.slice(9)]; S.view = 'organisms'; S.kingdom = o.kingdom; S.org[o.kingdom] = o.id; }
  else if (VIEWS.some((v) => v.id === h)) S.view = h;
  else S.view = 'overview';
  closeLayers(); hideTip(); render();
  if (!h.startsWith('drug-') && !h.startsWith('organism-')) window.scrollTo(0, 0);
}
function bind() {
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if (e.key === 'Escape') closeLayers();
  });
  $('#open-search').addEventListener('click', openPalette);
  $('#ctx-btn').addEventListener('click', (e) => openCtx(e.currentTarget));
  $('#menu-btn').addEventListener('click', () => $('#side').classList.toggle('open'));
  $('#nav').addEventListener('click', () => $('#side').classList.remove('open'));
  $('#theme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; store.set('theme', next);
  });
  addEventListener('online', renderNav); addEventListener('offline', renderNav);
  $('#view').addEventListener('click', (e) => {
    const t = e.target.closest('button, a'); if (!t) return;
    const ds = t.dataset;
    if (ds.kingdom) { S.kingdom = ds.kingdom; store.set('kingdom', S.kingdom); if (S.colorBy !== 'options') S.colorBy = 'options'; render(); }
    else if (ds.mode) { S.mode = ds.mode; render(); }
    else if (ds.sort) { S.sort = ds.sort; render(); }
    else if (ds.laneToggle != null) { const ad = S.mode === 'local' ? localAdapter() : refAdapter(S.kingdom); const l = lanesFor(ad); setLanes(l.includes(ds.laneToggle) ? l.filter((x) => x !== ds.laneToggle) : [...l, ds.laneToggle].slice(-4)); render(); }
    else if (ds.laneRemove != null) { const ad = S.mode === 'local' ? localAdapter() : refAdapter(S.kingdom); setLanes(lanesFor(ad).filter((x) => x !== ds.laneRemove)); render(); }
    else if ('clearLanes' in ds) { setLanes([]); render(); }
    else if (ds.preset) { const p = PRESETS[+ds.preset]; S.kingdom = p.k; S.mode = 'reference'; S.lanes[p.k] = [...p.lanes]; store.set('lanes', S.lanes); location.hash = 'spectrum'; }
    else if (ds.gotoDrug) { if (t.classList.contains('dcard') && !RM) t.classList.add('flash'); location.hash = 'drug-' + ds.gotoDrug; }
    else if (ds.addLane) { const d = drug(ds.addLane); const k = kingdomOfDrug(d); S.kingdom = k; S.mode = 'reference'; S.lanes[k] = [...S.lanes[k].filter((x) => x !== d.id), d.id].slice(-4); store.set('lanes', S.lanes); location.hash = 'spectrum'; }
    else if (ds.compareTop) { const o = D.orgById[ds.compareTop]; S.kingdom = o.kingdom; S.mode = 'reference'; S.lanes[o.kingdom] = kDrugs(o.kingdom).map((d) => ({ id: d.id, r: rankOf(o, d.id) ?? -1 })).sort((a, b) => b.r - a.r).slice(0, 3).map((x) => x.id); store.set('lanes', S.lanes); location.hash = 'spectrum'; }
    else if (ds.dfilter) { S.drugFilter = ds.dfilter; render(); }
    else if (ds.rail) { const r = $('#rail'); r.scrollBy({ left: +ds.rail * r.clientWidth * 0.8, behavior: RM ? 'auto' : 'smooth' }); }
    else if (ds.adv) { S.advFilter = ds.adv; render(); }
    else if ('openCtx' in ds) { openCtx(t); }
    else if ('loadExample' in ds) { fetch('data/example-antibiogram.json').then((r) => r.text()).then((txt) => { S.local = parseAntibiogram(txt, 'Example'); store.set('local', S.local); S.localLanes = null; render(); }).catch(() => { $('#abg-err').textContent = 'Couldn’t load the example file.'; }); }
    else if ('clearLocal' in ds) { S.local = null; store.del('local'); S.mode = 'reference'; render(); }
    else if ('modeLocal' in ds) { S.mode = 'local'; location.hash = 'spectrum'; }
  });
}

async function boot() {
  const theme = store.get('theme', null); if (theme) document.documentElement.dataset.theme = theme;
  const files = ['drugs', 'organisms', 'sources', 'sites', 'dosing', 'teaching-notes', 'combinations', 'alerts', 'curated', 'advances'];
  try {
    const got = await Promise.all(files.map((f) => fetch(`data/${f}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
    const [drugs, orgs, sources, sites, dosing, notes, combos, alerts, curated, advances] = got;
    if (!drugs || !orgs) throw new Error('core data missing');
    D = { version: drugs.version, drugs: drugs.drugs, orgs: orgs.organisms, codes: orgs.codes, sources: sources.sources, sites: sites.sites, dosing, notes: notes.notes, notesMeta: notes, combos: combos.combinations, alerts: alerts.alerts, curated: curated.items, advances };
  } catch {
    $('#view').innerHTML = '<div class="banner warn"><div><b>The reference data didn’t load.</b> Check your connection and reload. If you opened this file directly from disk, serve the folder over HTTP instead (for example <code class="mono">npx serve</code>).</div></div>';
    return;
  }
  D.drugById = Object.fromEntries(D.drugs.map((d) => [d.id, d]));
  D.orgById = Object.fromEntries(D.orgs.map((o) => [o.id, o]));
  if (!D.drugById[S.drug]) S.drug = 'TZP';
  bind(); route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
