// Source 1 : export complet de l'API Apprentissage (La bonne alternance).
// Doc : https://api.apprentissage.beta.gouv.fr — GET /api/job/v1/export renvoie { url, lastUpdate },
// l'url (valable 2 minutes) pointe vers un tableau JSON de toutes les offres actives diffusables.
// Ces offres viennent de France Travail, Hellowork, PASS (fonction publique), LinkedIn, Jobteaser, APEC...
import { fetchRetry, log, deptFrom, cityFrom, stripHtml, KIND, kindFromText } from '../lib/util.mjs';
import { streamJsonArray } from '../lib/jsonstream.mjs';

const BASE = process.env.LBA_API_BASE || 'https://api.apprentissage.beta.gouv.fr/api';

export async function collectLBA(token, push, { file } = {}) {
  let body;
  if (file) {
    const { createReadStream } = await import('node:fs');
    body = createReadStream(file);
  } else {
    if (!token) { log('LBA : pas de jeton (LBA_API_TOKEN), source ignorée'); return { ok: false, count: 0 }; }
    const meta = await fetchRetry(BASE + '/job/v1/export', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
    if (!meta.ok) throw new Error('LBA export : HTTP ' + meta.status + ' ' + (await meta.text()).slice(0, 200));
    const { url, lastUpdate } = await meta.json();
    log('LBA : export du', lastUpdate, '— téléchargement…');
    const res = await fetchRetry(url, {}, { timeout: 15 * 60000, tries: 3 });
    if (!res.ok) throw new Error('LBA fichier : HTTP ' + res.status);
    body = res.body;
  }
  let kept = 0;
  const n = await streamJsonArray(body, j => {
    const o = mapLBA(j);
    if (o) { push(o); kept++; }
  });
  log('LBA :', n, 'éléments lus,', kept, 'offres gardées');
  return { ok: true, count: kept };
}

const LABELS = { offres_emploi_lba: 'La bonne alternance', recruteurs_lba: 'La bonne alternance', PASS: 'PASS (fonction publique)', ATS_Hellowork: 'Hellowork', 'FranceTravail CEGID': 'France Travail' };
const srcLabel = l => LABELS[l] || l || 'La bonne alternance';

export function mapLBA(j) {
  const id = j?.identifier?.id;
  const title = j?.offer?.title;
  if (!id || !title) return null;
  if (j.offer?.status && !/active/i.test(j.offer.status)) return null;
  const wp = j.workplace || {};
  const addr = wp.location?.address || '';
  const geo = wp.location?.geopoint?.coordinates;
  const types = (j.contract?.type || []).join(', ');
  // l'API ne diffuse que des contrats en alternance ; on garde « stage » si l'intitule le dit explicitement sans alternance
  const k = kindFromText(title) === KIND.STAGE && !/apprentissage|professionnalisation/i.test(types) ? KIND.STAGE : KIND.ALTERNANCE;
  return {
    uid: 'lba:' + id,
    src: srcLabel(j.identifier?.partner_label),
    ext: j.identifier?.partner_job_id ? String(j.identifier.partner_job_id) : null,
    title: stripHtml(title),
    employer: (wp.brand || wp.name || wp.legal_name || 'Entreprise non précisée').trim(),
    dept: deptFrom(addr),
    city: cityFrom(addr),
    lat: Array.isArray(geo) ? +geo[1] : null,
    lon: Array.isArray(geo) ? +geo[0] : null,
    kind: k,
    created: j.offer?.publication?.creation || null,
    expires: j.offer?.publication?.expiration || null,
    level: +(j.offer?.target_diploma?.european || 0) || 0,
    levelLabel: j.offer?.target_diploma?.label || '',
    rome: (j.offer?.rome_codes || [])[0] || '',
    contract: types,
    start: j.contract?.start || null,
    duration: j.contract?.duration || null,
    remote: j.contract?.remote || null,
    desc: stripHtml(j.offer?.description),
    skills: (j.offer?.desired_skills || []).slice(0, 6),
    url: j.apply?.url || null,
    sector: wp.domain?.naf?.label || '',
  };
}
