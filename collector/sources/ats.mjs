// Source 3 : pages carriere publiques des entreprises (logiciels de recrutement).
// Chaque logiciel publie un flux d'offres public, prevu pour etre diffuse :
//   greenhouse      : https://boards-api.greenhouse.io/v1/boards/{id}/jobs?content=true
//   lever           : https://api.lever.co/v0/postings/{id}?mode=json  (ou api.eu.lever.co si "eu": true)
//   smartrecruiters : https://api.smartrecruiters.com/v1/companies/{id}/postings
// La liste des entreprises est dans collector/companies.json. On ne garde que les offres en France
// dont l'intitule ou le type indique un stage ou une alternance.
import { fetchRetry, log, pool, deptFrom, cityFrom, stripHtml, kindFromText, levelFromText } from '../lib/util.mjs';

const CITY_DEPT = { paris: '75', lyon: '69', marseille: '13', toulouse: '31', lille: '59', bordeaux: '33', nantes: '44', nice: '06', rennes: '35', strasbourg: '67', montpellier: '34', grenoble: '38', 'la defense': '92', puteaux: '92', courbevoie: '92', 'boulogne billancourt': '92', 'issy les moulineaux': '92', 'levallois perret': '92', nanterre: '92', 'saint denis': '93', massy: '91', 'sophia antipolis': '06' };
const cityDept = loc => { const n = loc.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim(); for (const [c, d] of Object.entries(CITY_DEPT)) if ((' ' + n + ' ').includes(' ' + c + ' ')) return d; return null; };
const isFrance = s => /\b(france|paris|lyon|marseille|toulouse|lille|bordeaux|nantes|nice|rennes|strasbourg|montpellier|grenoble|ile-de-france|île-de-france)\b/i.test(s || '');

async function greenhouse(c) {
  const r = await fetchRetry(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.id)}/jobs?content=true`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return ((await r.json()).jobs || []).map(j => ({
    id: j.id, title: j.title, loc: j.location?.name || '', url: j.absolute_url, created: j.first_published || j.updated_at,
    desc: j.content ? stripHtml(j.content.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : '', type: '',
  }));
}
async function lever(c) {
  const host = c.eu ? 'api.eu.lever.co' : 'api.lever.co';
  const r = await fetchRetry(`https://${host}/v0/postings/${encodeURIComponent(c.id)}?mode=json`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()).map(j => ({
    id: j.id, title: j.text, loc: j.categories?.location || '', url: j.hostedUrl, created: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    desc: j.descriptionPlain || stripHtml(j.description), type: j.categories?.commitment || '',
  }));
}
async function smartrecruiters(c) {
  const out = [];
  for (let off = 0; off < 2000; off += 100) {
    const r = await fetchRetry(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(c.id)}/postings?country=fr&limit=100&offset=${off}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    (j.content || []).forEach(p => out.push({
      id: p.id, title: p.name, loc: [p.location?.city, p.location?.region, 'France'].filter(Boolean).join(', '),
      url: `https://jobs.smartrecruiters.com/${encodeURIComponent(p.company?.identifier || c.id)}/${p.id}`,
      created: p.releasedDate, desc: '', type: p.typeOfEmployment?.label || '',
    }));
    if (!j.content || j.content.length < 100) break;
  }
  return out;
}
const FETCHERS = { greenhouse, lever, smartrecruiters };

export async function collectATS(companies, push) {
  let count = 0, ok = 0, ko = 0;
  await pool(companies, 4, async c => {
    const f = FETCHERS[c.ats];
    if (!f) { log('ATS : logiciel inconnu', c.ats, 'pour', c.name); return; }
    try {
      const jobs = await f(c);
      ok++;
      for (const j of jobs) {
        if (!isFrance(j.loc)) continue;
        const k = kindFromText(j.title, j.type);
        if (k == null) continue;
        count++;
        push({
          uid: `ats:${c.ats}:${c.id}:${j.id}`, src: c.name, ext: String(j.id), title: stripHtml(j.title), employer: c.name,
          dept: deptFrom(j.loc) || cityDept(j.loc), city: cityFrom(j.loc.replace(/,?\s*France$/i, '')), lat: null, lon: null, kind: k,
          created: j.created || null, expires: null, level: levelFromText(j.title + ' ' + j.desc.slice(0, 2000)), levelLabel: '',
          rome: c.rome || '', contract: j.type || '', start: null, duration: null, remote: null, desc: j.desc, skills: [], url: j.url, sector: c.sector || '',
        });
      }
    } catch (e) { ko++; log('ATS :', c.name, '(' + c.ats + '/' + c.id + ') :', e.message); }
  });
  log('ATS :', ok, 'entreprises lues,', ko, 'en erreur,', count, 'offres gardées');
  return { ok: true, count };
}
