// Source 2 : API Offres d'emploi v2 de France Travail (https://francetravail.io).
// Sert surtout aux offres de STAGE (rares ailleurs) et aux contrats d'alternance absents de l'export LBA.
// Limites de l'API : 150 offres par page, 1 150 par requete, ~10 appels par seconde.
import { fetchRetry, log, rateLimiter, pool, deptFrom, cityFrom, stripHtml, KIND, kindFromText, levelFromText } from '../lib/util.mjs';
import { DEPTS } from '../lib/depts.mjs';

const TOKEN_URL = process.env.FT_TOKEN_URL || 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const API = process.env.FT_API || 'https://api.francetravail.io/partenaire/offresdemploi/v2';
const limit = rateLimiter(8);

async function getToken(id, secret) {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'api_offresdemploiv2 o2dsoffre' });
  const res = await fetchRetry(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error('France Travail : authentification refusée (HTTP ' + res.status + '). Vérifie FT_CLIENT_ID et FT_CLIENT_SECRET.');
  const j = await res.json();
  return { value: j.access_token, until: Date.now() + (j.expires_in - 60) * 1000 };
}

export async function collectFT(id, secret, push) {
  if (!id || !secret) { log('France Travail : pas d’identifiants (FT_CLIENT_ID / FT_CLIENT_SECRET), source ignorée'); return { ok: false, count: 0 }; }
  let tok = await getToken(id, secret);
  const auth = async () => { if (Date.now() > tok.until) tok = await getToken(id, secret); return { Authorization: 'Bearer ' + tok.value, Accept: 'application/json' }; };

  async function call(path, params) {
    await limit();
    const qs = new URLSearchParams(params).toString();
    const res = await fetchRetry(API + path + (qs ? '?' + qs : ''), { headers: await auth() });
    if (res.status === 204) return { list: [], total: 0 };
    if (!res.ok && res.status !== 206) throw new Error('France Travail ' + path + ' : HTTP ' + res.status);
    const j = await res.json();
    const cr = res.headers.get('content-range') || '';
    const total = +(cr.split('/')[1] || 0) || (j.resultats || []).length;
    return { list: j.resultats || j, total };
  }

  // Natures de contrat « apprentissage » et « professionnalisation » lues dans le referentiel officiel.
  const natures = (await call('/referentiel/naturesContrats', {})).list
    .filter(n => /apprentissage|professionnalisation/i.test(n.libelle)).map(n => n.code);
  log('France Travail : natures de contrat alternance =', natures.join(', ') || 'aucune');

  // Recupere toutes les offres d'une requete, en decoupant par dates si elle depasse 1 150 resultats.
  async function all(params, from = null, to = null, depth = 0) {
    const p = { ...params };
    if (from) { p.minCreationDate = iso(from); p.maxCreationDate = iso(to); }
    const first = await call('/offres/search', { ...p, range: '0-149' });
    if (first.total > 1150 && depth < 6) {
      const end = to || new Date(), start = from || new Date(Date.now() - 400 * 864e5);
      const mid = new Date((start.getTime() + end.getTime()) / 2);
      return [...await all(params, start, mid, depth + 1), ...await all(params, mid, end, depth + 1)];
    }
    let out = first.list;
    for (let s = 150; s < Math.min(first.total, 1150); s += 150) {
      out = out.concat((await call('/offres/search', { ...p, range: s + '-' + Math.min(s + 149, 1149) })).list);
    }
    return out;
  }

  let count = 0;
  const seen = new Set();
  const take = (r, forced) => {
    if (!r?.id || seen.has(r.id)) return;
    const k = forced ?? kindFromText(r.intitule);
    if (k == null) return;
    seen.add(r.id); count++;
    push(mapFT(r, k));
  };
  await pool(DEPTS.map(d => d[0]), 3, async dep => {
    try {
      for (const nat of natures) (await all({ departement: dep, natureContrat: nat })).forEach(r => take(r, kindFromText(r.intitule) === KIND.STAGE ? KIND.STAGE : KIND.ALTERNANCE));
      (await all({ departement: dep, motsCles: 'stage' })).forEach(r => take(r, null));
    } catch (e) { log('France Travail', dep, ':', e.message); }
  });
  log('France Travail :', count, 'offres gardées');
  return { ok: true, count };
}

const iso = d => d.toISOString().slice(0, 19) + 'Z';

export function mapFT(r, kind) {
  const lt = r.lieuTravail || {};
  const lib = lt.libelle || '';
  const dept = lt.codePostal ? deptFrom(lt.codePostal) : (lib.match(/^(\d{2,3}|2A|2B)\s*-/) || [])[1] || null;
  const formation = (r.formations || []).map(f => f.niveauLibelle || f.domaineLibelle || '').join(' ');
  return {
    uid: 'ft:' + r.id,
    src: 'France Travail',
    ext: String(r.id),
    title: stripHtml(r.intitule),
    employer: (r.entreprise?.nom || 'Entreprise non précisée').trim(),
    dept,
    city: lt.commune ? cityFrom(lib) : cityFrom(lib),
    lat: lt.latitude ?? null,
    lon: lt.longitude ?? null,
    kind,
    created: r.dateCreation || null,
    expires: null,
    level: levelFromText(formation + ' ' + (r.intitule || '')),
    levelLabel: formation.trim(),
    rome: r.romeCode || '',
    contract: [r.typeContratLibelle, r.natureContrat].filter(Boolean).join(' · '),
    start: null,
    duration: r.dureeTravailLibelle || null,
    remote: null,
    desc: stripHtml(r.description),
    skills: (r.competences || []).map(c => c.libelle).slice(0, 6),
    url: r.origineOffre?.urlOrigine || 'https://candidat.francetravail.fr/offres/recherche/detail/' + r.id,
    sector: r.secteurActiviteLibelle || '',
    salary: r.salaire?.libelle || '',
  };
}
