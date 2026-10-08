// Outils communs du robot de collecte.
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** fetch avec delai maximum et nouvelles tentatives (erreurs reseau, 429, 5xx). */
export async function fetchRetry(url, opts = {}, { tries = 4, timeout = 60000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { ...opts, signal: ctl.signal });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) {
        last = new Error('HTTP ' + res.status + ' sur ' + url.split('?')[0]);
        await sleep(1000 * 2 ** i + Math.random() * 500);
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(t);
      last = e;
      await sleep(1000 * 2 ** i);
    }
  }
  throw last;
}

/** Limiteur simple : au plus `perSecond` appels par seconde. */
export function rateLimiter(perSecond) {
  let next = 0;
  return async () => {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + 1000 / perSecond;
    if (wait) await sleep(wait);
  };
}

/** Execute fn sur chaque element avec au plus `n` taches en parallele. */
export async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

export function stripHtml(s) {
  return String(s || '')
    .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

export function norm(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Hash FNV-1a 32 bits, pour repartir les fiches dans des paquets. */
export function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Departement a partir d'un code postal ou d'un texte qui en contient un. */
export function deptFrom(text) {
  const m = String(text || '').match(/\b(\d{5})\b(?!.*\b\d{5}\b)/s);
  if (!m) return null;
  const cp = m[1];
  if (cp.startsWith('97') || cp.startsWith('98')) return cp.slice(0, 3);
  if (cp.startsWith('20')) return +cp.slice(0, 3) < 202 ? '2A' : '2B';
  const d = cp.slice(0, 2);
  return d === '00' ? null : d;
}

/** Ville a partir d'une adresse « 12 rue X 75011 Paris » ou « Paris (75) ». */
export function cityFrom(text) {
  const s = String(text || '').trim();
  const m = s.match(/\b\d{5}\s+([^,\d]+?)\s*(?:,|$)/);
  if (m) return m[1].trim();
  const p = s.match(/^\d{2,3}\s*-\s*(.+)$/); // format France Travail « 75 - Paris 11e »
  if (p) return p[1].trim();
  return s.split(',').pop().trim().slice(0, 60);
}

export const KIND = { ALTERNANCE: 0, STAGE: 1 };
const RE_STAGE = /\b(stage|stagiaire|internship|intern)\b/i;
const RE_ALT = /\b(alternance|alternant|alternante|apprenti|apprentie|apprentissage|apprenticeship|apprentice|contrat pro|professionnalisation|work[- ]study)\b/i;
/** Classe un intitule : 0 alternance, 1 stage, null si ni l'un ni l'autre. */
export function kindFromText(...texts) {
  const t = texts.filter(Boolean).join(' ');
  if (RE_ALT.test(t)) return KIND.ALTERNANCE;
  if (RE_STAGE.test(t)) return KIND.STAGE;
  return null;
}

/** Niveau de diplome europeen (3 CAP, 4 Bac, 5 Bac+2, 6 Bac+3/4, 7 Bac+5) deduit d'un texte. */
export function levelFromText(t) {
  const s = norm(t);
  if (/bac 5|master|ingenieur|mba|niveau 7/.test(s)) return 7;
  if (/bac 3|bac 4|licence|bachelor|but\b|niveau 6/.test(s)) return 6;
  if (/bac 2|bts|dut|niveau 5/.test(s)) return 5;
  if (/\bbac\b|bac pro|niveau 4/.test(s)) return 4;
  if (/\bcap\b|bep|niveau 3/.test(s)) return 3;
  return 0;
}
