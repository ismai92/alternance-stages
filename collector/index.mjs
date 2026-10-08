// Robot de collecte : recupere les offres de stage et d'alternance, les nettoie, les dedoublonne
// et ecrit les fichiers de donnees lus par le site (site/data/).
//
// Variables d'environnement (a mettre dans les secrets GitHub) :
//   LBA_API_TOKEN     jeton de l'API Apprentissage (La bonne alternance)
//   FT_CLIENT_ID      identifiant client France Travail
//   FT_CLIENT_SECRET  cle secrete France Travail
//   SITE_URL          adresse publique du site, pour retrouver la date de premiere apparition des offres
// Options de test : LBA_FILE (export local), SKIP_FT=1, SKIP_ATS=1, OUT_DIR.
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { log, norm, fnv, fetchRetry } from './lib/util.mjs';
import { DEPTS, DEPT_CODES } from './lib/depts.mjs';
import { collectLBA } from './sources/labonnealternance.mjs';
import { collectFT } from './sources/francetravail.mjs';
import { collectATS } from './sources/ats.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR || path.join(here, '..', 'site', 'data');
const BUCKETS = 256;
const DESC_MAX = 1500;

const offers = [];
const push = o => { if (o && o.title) { o.employer = o.employer.replace(/<[^>]+>/g, '').trim() || 'Entreprise non précisée'; offers.push(o); } };

const started = Date.now();
const report = {};
async function run(name, fn) {
  try { report[name] = await fn(); }
  catch (e) { report[name] = { ok: false, count: 0, error: e.message }; log('ERREUR', name, ':', e.message); }
}

await run('La bonne alternance', () => collectLBA(process.env.LBA_API_TOKEN, push, { file: process.env.LBA_FILE }));
if (!process.env.SKIP_FT) await run('France Travail', () => collectFT(process.env.FT_CLIENT_ID, process.env.FT_CLIENT_SECRET, push));
if (!process.env.SKIP_ATS) {
  const companies = JSON.parse(await readFile(path.join(here, 'companies.json'), 'utf8'));
  await run('Pages carrière', () => collectATS(companies, push));
}

// ---------- dedoublonnage ----------
const byUid = new Map();
const lbaExt = new Set(offers.filter(o => o.uid.startsWith('lba:') && /france ?travail/i.test(o.src) && o.ext).map(o => o.ext));
const fuzzy = new Set();
let dup = 0;
for (const o of offers) {
  if (byUid.has(o.uid)) { dup++; continue; }
  if (o.uid.startsWith('ft:') && lbaExt.has(o.ext)) { dup++; continue; }
  const key = norm(o.title) + '|' + norm(o.employer) + '|' + norm(o.city) + '|' + (o.dept || '');
  if (fuzzy.has(key)) { dup++; continue; }
  fuzzy.add(key);
  byUid.set(o.uid, o);
}
const list = [...byUid.values()];
log('Total :', offers.length, 'offres brutes,', dup, 'doublons retirés,', list.length, 'offres uniques');
if (list.length === 0) { log('Aucune offre : on arrête sans publier pour garder la version précédente du site.'); process.exit(1); }

// ---------- premiere apparition (pour « nouveau depuis ta derniere visite » et les alertes) ----------
const nowH = Math.floor(Date.now() / 36e5);
let prevSeen = {};
if (process.env.SITE_URL) {
  try {
    const r = await fetchRetry(process.env.SITE_URL.replace(/\/$/, '') + '/data/seen.json', {}, { tries: 2, timeout: 30000 });
    if (r.ok) prevSeen = await r.json();
  } catch (e) { log('seen.json précédent introuvable :', e.message); }
}
const firstRun = Object.keys(prevSeen).length === 0;

// ---------- ecriture ----------
const shortId = uid => fnv(uid).toString(36) + fnv('x' + uid).toString(36);
const srcList = [];
const srcIdx = s => { let i = srcList.indexOf(s); if (i < 0) { srcList.push(s); i = srcList.length - 1; } return i; };
const day = d => { const t = Date.parse(d); return isNaN(t) ? 0 : Math.floor(t / 864e5); };
const r2 = x => (x == null || isNaN(x) ? null : Math.round(x * 100) / 100);

const byDept = {}, buckets = Array.from({ length: BUCKETS }, () => ({})), seen = {};
const counts = { alternance: 0, stage: 0 }, srcCounts = {};
for (const o of list) {
  const id = shortId(o.uid);
  const dept = o.dept && DEPT_CODES.has(o.dept) ? o.dept : '00';
  const first = prevSeen[id] ?? (firstRun ? Math.min(nowH, Math.floor(Date.parse(o.created || 0) / 36e5) || nowH) : nowH);
  seen[id] = first;
  (byDept[dept] ||= []).push([id, o.title, o.employer, o.city || '', o.kind, day(o.created), first, o.level || 0, (o.rome || '').slice(0, 3), srcIdx(o.src), r2(o.lat), r2(o.lon)]);
  buckets[fnv(id) % BUCKETS][id] = {
    t: o.title, e: o.employer, c: o.city || '', d: dept, k: o.kind, s: o.src, u: o.url,
    x: (o.desc || '').length > DESC_MAX ? o.desc.slice(0, DESC_MAX).replace(/\s+\S*$/, '') + '…' : (o.desc || ''),
    co: o.contract || '', st: o.start || null, du: o.duration || null, lv: o.levelLabel || '', l: o.level || 0, sk: o.skills || [],
    re: o.remote || null, se: o.sector || '', sa: o.salary || '', cr: o.created || null, ex: o.expires || null, r: o.rome || '',
  };
  counts[o.kind === 1 ? 'stage' : 'alternance']++;
  srcCounts[o.src] = (srcCounts[o.src] || 0) + 1;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, 'i'), { recursive: true });
await mkdir(path.join(OUT, 'o'), { recursive: true });
for (const [d, rows] of Object.entries(byDept)) {
  rows.sort((a, b) => b[6] - a[6] || b[5] - a[5]);
  await writeFile(path.join(OUT, 'i', d + '.json'), JSON.stringify(rows));
}
for (let b = 0; b < BUCKETS; b++) await writeFile(path.join(OUT, 'o', b + '.json'), JSON.stringify(buckets[b]));
await writeFile(path.join(OUT, 'seen.json'), JSON.stringify(seen));
const meta = {
  updated: new Date().toISOString(), nowHour: nowH, total: list.length, counts, buckets: BUCKETS,
  sources: srcList, sourceCounts: Object.entries(srcCounts).sort((a, b) => b[1] - a[1]),
  depts: Object.fromEntries(Object.entries(byDept).map(([d, r]) => [d, r.length])),
  run: Object.fromEntries(Object.entries(report).map(([k, v]) => [k, { ok: !!v.ok, count: v.count || 0, error: v.error || null }])),
  seconds: Math.round((Date.now() - started) / 1000),
};
await writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta));
log('Écrit dans', OUT, '—', Object.keys(byDept).length, 'départements,', counts.alternance, 'alternances,', counts.stage, 'stages, en', meta.seconds, 's');
