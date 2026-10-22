// Weekly refresh of data/advances.json: recent high-evidence PubMed papers and FDA press releases
// about antimicrobials. Run by .github/workflows/update-advances.yml; no dependencies (Node 20+).
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const FDA_RSS = 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml';
const DAYS = 120;
const EVIDENCE = '(randomized controlled trial[pt] OR practice guideline[pt] OR guideline[pt] OR meta-analysis[pt] OR systematic review[pt])';
const FDA_KEYWORDS = /antibiotic|antibacterial|antifungal|antiviral|antimicrobial|infection|resistan|gonorrh|urinary tract|pneumonia|sepsis/i;

const { drugs } = JSON.parse(await readFile(new URL('data/drugs.json', ROOT), 'utf8'));
// Each drug lists word stems (drugs.json "terms") that must all appear, so combinations
// such as piperacillin-tazobactam are not tagged on every piperacillin paper.
const tagDrugs = (text) => drugs.filter((d) => d.terms.every((t) => new RegExp(`\\b${t}`, 'i').test(text))).map((d) => d.id);
const INFECTION = '(infect*[tiab] OR resistan*[tiab] OR bacter*[tiab] OR fung*[tiab] OR vir*[tiab])';
// One query per drug family, built from the drugs in the app, so results stay on topic.
const TOPICS = ['antibacterial', 'antifungal', 'antiviral'].map((kingdom) => {
  const clauses = [...new Set(drugs.filter((d) => d.kingdom === kingdom).map((d) => `(${d.terms.map((t) => `${t}*[tiab]`).join(' AND ')})`))];
  return { kingdom, term: `(${clauses.join(' OR ')}) AND ${EVIDENCE} AND ${INFECTION} AND humans[mh]` };
});

const HEADERS = { 'User-Agent': 'antibiotogram-advances/1.0 (+https://github.com/itskaero/antibiotogram)' };

async function getJSON(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`GET ${url} failed`);
}

async function pubmed({ kingdom, term }) {
  const q = new URLSearchParams({ db: 'pubmed', retmode: 'json', retmax: '15', datetype: 'edat', reldate: String(DAYS), term });
  const ids = (await getJSON(`${EUTILS}esearch.fcgi?${q}`)).esearchresult?.idlist ?? [];
  if (!ids.length) return [];
  await new Promise((r) => setTimeout(r, 400)); // stay under NCBI's 3 requests/second
  const res = (await getJSON(`${EUTILS}esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`)).result ?? {};
  return ids.map((id) => res[id]).filter(Boolean).map((a) => ({
    id: `pmid-${a.uid}`,
    source: 'PubMed',
    kind: (a.pubtype || []).find((t) => /Guideline|Randomized|Meta-Analysis|Systematic Review/.test(t)) || 'Article',
    kingdom,
    date: ((a.history || []).find((h) => h.pubstatus === 'entrez')?.date || a.sortpubdate || '').slice(0, 10).replace(/\//g, '-'),
    title: a.title.replace(/\.$/, ''),
    journal: a.source,
    authors: (a.authors || []).slice(0, 2).map((x) => x.name).join(', ') + ((a.authors || []).length > 2 ? ' et al.' : ''),
    url: `https://pubmed.ncbi.nlm.nih.gov/${a.uid}/`,
    drugs: tagDrugs(a.title),
  }));
}

async function fdaPress() {
  const res = await fetch(FDA_RSS, { headers: HEADERS });
  if (!res.ok) throw new Error(`FDA RSS ${res.status}`);
  const xml = await res.text();
  const tag = (s, t) => (s.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)) || [])[1]?.trim() ?? '';
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1])
    .filter((it) => FDA_KEYWORDS.test(tag(it, 'title') + ' ' + tag(it, 'description')))
    .map((it) => ({
      id: `fda-${tag(it, 'link').split('/').filter(Boolean).pop()}`,
      source: 'FDA', kind: 'Press release', kingdom: null,
      date: new Date(tag(it, 'pubDate')).toISOString().slice(0, 10),
      title: tag(it, 'title'), url: tag(it, 'link'), drugs: tagDrugs(tag(it, 'title') + ' ' + tag(it, 'description')),
    }));
}

const results = await Promise.allSettled([...TOPICS.map(pubmed), fdaPress()]);
const failures = results.filter((r) => r.status === 'rejected').map((r) => String(r.reason));
const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
if (!items.length) { console.error('No items fetched:', failures); process.exit(1); }

const seen = new Set();
const out = {
  generated: new Date().toISOString(),
  window: `last ${DAYS} days`,
  sources: ['PubMed E-utilities (guidelines, RCTs, meta-analyses, systematic reviews)', 'FDA press releases RSS'],
  failures,
  items: items.filter((i) => !seen.has(i.id) && seen.add(i.id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60),
};
await writeFile(new URL('data/advances.json', ROOT), JSON.stringify(out, null, 1) + '\n');
console.log(`advances.json: ${out.items.length} items${failures.length ? `, ${failures.length} source(s) failed` : ''}`);
