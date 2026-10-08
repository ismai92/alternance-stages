/* Application : recherche d'offres, suivi des candidatures, alertes. Tout tourne dans le navigateur. */
(() => {
'use strict';
const C = Object.assign({ APP_NAME: 'Alternance & Stages', PAGE_SIZE: 30 }, window.CONFIG || {});
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const LS = {
  get(k, d) { try { const v = localStorage.getItem('as:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('as:' + k, JSON.stringify(v)); } catch (e) {} },
};
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }

/* ---------- referentiels ---------- */
const DEPTS = [['01','Ain','Auvergne-Rhône-Alpes'],['02','Aisne','Hauts-de-France'],['03','Allier','Auvergne-Rhône-Alpes'],['04','Alpes-de-Haute-Provence','Provence-Alpes-Côte d’Azur'],['05','Hautes-Alpes','Provence-Alpes-Côte d’Azur'],['06','Alpes-Maritimes','Provence-Alpes-Côte d’Azur'],['07','Ardèche','Auvergne-Rhône-Alpes'],['08','Ardennes','Grand Est'],['09','Ariège','Occitanie'],['10','Aube','Grand Est'],['11','Aude','Occitanie'],['12','Aveyron','Occitanie'],['13','Bouches-du-Rhône','Provence-Alpes-Côte d’Azur'],['14','Calvados','Normandie'],['15','Cantal','Auvergne-Rhône-Alpes'],['16','Charente','Nouvelle-Aquitaine'],['17','Charente-Maritime','Nouvelle-Aquitaine'],['18','Cher','Centre-Val de Loire'],['19','Corrèze','Nouvelle-Aquitaine'],['2A','Corse-du-Sud','Corse'],['2B','Haute-Corse','Corse'],['21','Côte-d’Or','Bourgogne-Franche-Comté'],['22','Côtes-d’Armor','Bretagne'],['23','Creuse','Nouvelle-Aquitaine'],['24','Dordogne','Nouvelle-Aquitaine'],['25','Doubs','Bourgogne-Franche-Comté'],['26','Drôme','Auvergne-Rhône-Alpes'],['27','Eure','Normandie'],['28','Eure-et-Loir','Centre-Val de Loire'],['29','Finistère','Bretagne'],['30','Gard','Occitanie'],['31','Haute-Garonne','Occitanie'],['32','Gers','Occitanie'],['33','Gironde','Nouvelle-Aquitaine'],['34','Hérault','Occitanie'],['35','Ille-et-Vilaine','Bretagne'],['36','Indre','Centre-Val de Loire'],['37','Indre-et-Loire','Centre-Val de Loire'],['38','Isère','Auvergne-Rhône-Alpes'],['39','Jura','Bourgogne-Franche-Comté'],['40','Landes','Nouvelle-Aquitaine'],['41','Loir-et-Cher','Centre-Val de Loire'],['42','Loire','Auvergne-Rhône-Alpes'],['43','Haute-Loire','Auvergne-Rhône-Alpes'],['44','Loire-Atlantique','Pays de la Loire'],['45','Loiret','Centre-Val de Loire'],['46','Lot','Occitanie'],['47','Lot-et-Garonne','Nouvelle-Aquitaine'],['48','Lozère','Occitanie'],['49','Maine-et-Loire','Pays de la Loire'],['50','Manche','Normandie'],['51','Marne','Grand Est'],['52','Haute-Marne','Grand Est'],['53','Mayenne','Pays de la Loire'],['54','Meurthe-et-Moselle','Grand Est'],['55','Meuse','Grand Est'],['56','Morbihan','Bretagne'],['57','Moselle','Grand Est'],['58','Nièvre','Bourgogne-Franche-Comté'],['59','Nord','Hauts-de-France'],['60','Oise','Hauts-de-France'],['61','Orne','Normandie'],['62','Pas-de-Calais','Hauts-de-France'],['63','Puy-de-Dôme','Auvergne-Rhône-Alpes'],['64','Pyrénées-Atlantiques','Nouvelle-Aquitaine'],['65','Hautes-Pyrénées','Occitanie'],['66','Pyrénées-Orientales','Occitanie'],['67','Bas-Rhin','Grand Est'],['68','Haut-Rhin','Grand Est'],['69','Rhône','Auvergne-Rhône-Alpes'],['70','Haute-Saône','Bourgogne-Franche-Comté'],['71','Saône-et-Loire','Bourgogne-Franche-Comté'],['72','Sarthe','Pays de la Loire'],['73','Savoie','Auvergne-Rhône-Alpes'],['74','Haute-Savoie','Auvergne-Rhône-Alpes'],['75','Paris','Île-de-France'],['76','Seine-Maritime','Normandie'],['77','Seine-et-Marne','Île-de-France'],['78','Yvelines','Île-de-France'],['79','Deux-Sèvres','Nouvelle-Aquitaine'],['80','Somme','Hauts-de-France'],['81','Tarn','Occitanie'],['82','Tarn-et-Garonne','Occitanie'],['83','Var','Provence-Alpes-Côte d’Azur'],['84','Vaucluse','Provence-Alpes-Côte d’Azur'],['85','Vendée','Pays de la Loire'],['86','Vienne','Nouvelle-Aquitaine'],['87','Haute-Vienne','Nouvelle-Aquitaine'],['88','Vosges','Grand Est'],['89','Yonne','Bourgogne-Franche-Comté'],['90','Territoire de Belfort','Bourgogne-Franche-Comté'],['91','Essonne','Île-de-France'],['92','Hauts-de-Seine','Île-de-France'],['93','Seine-Saint-Denis','Île-de-France'],['94','Val-de-Marne','Île-de-France'],['95','Val-d’Oise','Île-de-France'],['971','Guadeloupe','Outre-mer'],['972','Martinique','Outre-mer'],['973','Guyane','Outre-mer'],['974','La Réunion','Outre-mer'],['976','Mayotte','Outre-mer']];
const DEPT_NAME = Object.fromEntries(DEPTS.map(d => [d[0], d[1]]));
const REGIONS = [...new Set(DEPTS.map(d => d[2]))].sort((a, b) => a.localeCompare(b, 'fr'));
const DOMAINS = [['', 'Tous les domaines'], ['M18', 'Informatique, réseaux, télécoms'], ['J', 'Santé'], ['D', 'Commerce, vente'], ['G', 'Hôtellerie, restauration, tourisme'], ['M', 'Gestion, RH, comptabilité, administration'], ['C', 'Banque, assurance, immobilier'], ['F', 'Bâtiment, travaux publics'], ['H', 'Industrie'], ['I', 'Installation, maintenance'], ['N', 'Transport, logistique'], ['K', 'Services à la personne et collectivités'], ['E', 'Communication, médias'], ['A', 'Agriculture, espaces verts'], ['B', 'Arts, artisanat d’art'], ['L', 'Spectacle']];
const LEVELS = { 3: 'CAP, BEP', 4: 'Bac', 5: 'Bac+2', 6: 'Bac+3/4', 7: 'Bac+5' };
const STATUTS = [['garder', 'À postuler'], ['postule', 'Postulé'], ['relance', 'Relancé'], ['entretien', 'Entretien'], ['refus', 'Refus'], ['accepte', 'Accepté !']];
const STATUT_NAME = Object.fromEntries(STATUTS);
// colonnes de l'index : 0 id, 1 intitule, 2 employeur, 3 ville, 4 type (0 alternance, 1 stage), 5 jour de creation,
// 6 heure de premiere apparition, 7 niveau, 8 code ROME (3 car.), 9 source, 10 lat, 11 lon

/* ---------- etat ---------- */
let meta = null;
const cache = new Map(); // departement -> lignes
const deptOf = new Map(); // id -> departement
const buckets = new Map();
const f = Object.assign({ q: '', loc: 'FR', kind: 'all', dom: '', lvl: 0, since: 0 }, LS.get('filters', {}));
let shown = C.PAGE_SIZE, lastResults = [], tab = 'offres';
const lastVisitHour = LS.get('lastVisit', 0);
let suivi = LS.get('suivi', {});
let alertes = LS.get('alertes', []);
let suiviFilter = 'tous';

document.title = C.APP_NAME;
$('#app-name').textContent = C.APP_NAME;

/* ---------- chargement des donnees ---------- */
async function getJSON(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' : ' + r.status); return r.json(); }
function deptsForLoc(loc) {
  if (!meta) return [];
  const avail = Object.keys(meta.depts);
  if (loc === 'FR') return avail;
  if (loc.startsWith('R:')) { const reg = loc.slice(2); return DEPTS.filter(d => d[2] === reg).map(d => d[0]).filter(d => avail.includes(d)); }
  if (loc.startsWith('D:')) { const d = loc.slice(2); return avail.includes(d) ? [d] : []; }
  return [];
}
async function loadDepts(list, onProgress) {
  const todo = list.filter(d => !cache.has(d));
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(6, todo.length) }, async () => {
    while (i < todo.length) {
      const d = todo[i++];
      try {
        const rows = await getJSON('data/i/' + d + '.json');
        rows.forEach(r => deptOf.set(r[0], d));
        cache.set(d, rows);
      } catch (e) { cache.set(d, []); }
      onProgress && onProgress();
    }
  }));
}
async function getDetail(id) {
  const b = fnv(id) % (meta?.buckets || 256);
  if (!buckets.has(b)) buckets.set(b, getJSON('data/o/' + b + '.json').catch(() => ({})));
  return (await buckets.get(b))[id] || null;
}

/* ---------- filtrage ---------- */
const nowDay = () => Math.floor(Date.now() / 864e5);
function matcher(ff) {
  const words = norm(ff.q).split(' ').filter(Boolean);
  const kind = ff.kind === 'all' ? null : +ff.kind;
  const lvl = +ff.lvl || 0, since = +ff.since || 0, dom = ff.dom || '';
  const minHour = since ? (meta?.nowHour || Math.floor(Date.now() / 36e5)) - since * 24 : 0;
  return r => {
    if (kind != null && r[4] !== kind) return false;
    if (lvl && r[7] && r[7] !== lvl) return false;
    if (dom && !(r[8] || '').startsWith(dom)) return false;
    if (minHour && Math.max(r[6], (r[5] || 0) * 24) < minHour) return false;
    if (words.length) {
      const t = r.n || (r.n = norm(r[1] + ' ' + r[2] + ' ' + r[3]));
      for (const w of words) if (!t.includes(w)) return false;
    }
    return true;
  };
}
function search(ff) {
  const m = matcher(ff), out = [];
  for (const d of deptsForLoc(ff.loc)) for (const r of cache.get(d) || []) if (m(r)) out.push(r);
  out.sort((a, b) => b[6] - a[6] || b[5] - a[5]);
  return out;
}

/* ---------- affichage ---------- */
function ago(dayN) {
  if (!dayN) return '';
  const d = nowDay() - dayN;
  if (d <= 0) return 'Aujourd’hui'; if (d === 1) return 'Hier'; if (d < 30) return 'Il y a ' + d + ' jours';
  return 'Le ' + new Date(dayN * 864e5).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function cardHTML(r) {
  const saved = !!suivi[r[0]], d = deptOf.get(r[0]);
  const isNew = lastVisitHour && r[6] > lastVisitHour;
  const place = [r[3], d && d !== '00' ? '(' + d + ')' : ''].filter(Boolean).join(' ') || (d === '00' ? 'Lieu non précisé' : '');
  return '<li class="card" data-open="' + esc(r[0]) + '" tabindex="0">' +
    '<div><h2>' + esc(r[1]) + '</h2><p class="who">' + esc(r[2]) + (place ? ' · ' + esc(place) : '') + '</p></div>' +
    '<button class="star" data-star="' + esc(r[0]) + '" aria-pressed="' + saved + '" aria-label="' + (saved ? 'Retirer de mon suivi' : 'Garder dans mon suivi') + '">' + (saved ? '★' : '☆') + '</button>' +
    '<div class="meta"><span class="tag k' + r[4] + '">' + (r[4] === 1 ? 'Stage' : 'Alternance') + '</span>' +
    (isNew ? '<span class="tag new">Nouveau</span>' : '') +
    (r[7] && LEVELS[r[7]] ? '<span>' + LEVELS[r[7]] + '</span>' : '') +
    '<span>' + ago(r[5]) + '</span>' +
    (meta?.sources?.[r[9]] ? '<span>via ' + esc(meta.sources[r[9]]) + '</span>' : '') +
    (saved ? '<span class="tag st">' + esc(STATUT_NAME[suivi[r[0]].status] || 'Gardée') + '</span>' : '') + '</div></li>';
}
function renderResults() {
  const list = $('#results');
  if (!meta) return;
  const n = lastResults.length;
  $('#rescount').textContent = n ? n.toLocaleString('fr-FR') + ' offre' + (n > 1 ? 's' : '') : '';
  if (!n) {
    list.innerHTML = '<li class="empty"><b>Aucune offre ne correspond.</b><span>Essaie un mot-clé plus court, élargis le lieu à la région ou retire un filtre.</span></li>';
    $('#more').hidden = true; return;
  }
  list.innerHTML = lastResults.slice(0, shown).map(cardHTML).join('');
  $('#more').hidden = shown >= n;
}
async function runSearch(resetPage = true) {
  LS.set('filters', f);
  if (resetPage) shown = C.PAGE_SIZE;
  const need = deptsForLoc(f.loc).filter(d => !cache.has(d));
  if (need.length) {
    $('#results').innerHTML = '<li class="skel"></li><li class="skel"></li><li class="skel"></li>';
    $('#rescount').textContent = 'Chargement des offres…';
    let k = 0;
    await loadDepts(need, () => { k++; if (k % 10 === 0) { lastResults = search(f); renderResults(); } });
  }
  lastResults = search(f);
  renderResults();
}

/* ---------- formulaire ---------- */
function fillSelects() {
  const loc = $('#f-loc');
  loc.innerHTML = '<option value="FR">Toute la France</option>' +
    '<optgroup label="Régions">' + REGIONS.map(r => '<option value="R:' + esc(r) + '">' + esc(r) + '</option>').join('') + '</optgroup>' +
    '<optgroup label="Départements">' + DEPTS.map(d => '<option value="D:' + d[0] + '">' + d[0] + ' · ' + esc(d[1]) + '</option>').join('') + '</optgroup>';
  $('#f-dom').innerHTML = DOMAINS.map(d => '<option value="' + d[0] + '">' + esc(d[1]) + '</option>').join('');
  $('#f-q').value = f.q; loc.value = f.loc; $('#f-kind').value = String(f.kind); $('#f-dom').value = f.dom; $('#f-lvl').value = String(f.lvl); $('#f-since').value = String(f.since);
  if (loc.value !== f.loc) { f.loc = 'FR'; loc.value = 'FR'; }
}
let qT;
$('#f-q').addEventListener('input', e => { f.q = e.target.value; clearTimeout(qT); qT = setTimeout(() => runSearch(), 220); });
[['#f-loc', 'loc'], ['#f-kind', 'kind'], ['#f-dom', 'dom'], ['#f-lvl', 'lvl'], ['#f-since', 'since']].forEach(([s, k]) =>
  $(s).addEventListener('change', e => { f[k] = e.target.value; runSearch(); }));
$('#search').addEventListener('submit', e => { e.preventDefault(); runSearch(); });
$('#more').addEventListener('click', () => { shown += C.PAGE_SIZE; renderResults(); });

/* ---------- suivi ---------- */
function saveSuivi() { LS.set('suivi', suivi); updateCounts(); }
async function toggleStar(id) {
  if (suivi[id]) { delete suivi[id]; saveSuivi(); toast('Retirée de ton suivi'); }
  else {
    const r = findRow(id), d = await getDetail(id);
    suivi[id] = { t: r ? r[1] : d?.t, e: r ? r[2] : d?.e, c: r ? r[3] : d?.c, k: r ? r[4] : d?.k, u: d?.u || null, status: 'garder', note: '', added: Date.now(), updated: Date.now() };
    saveSuivi(); toast('Ajoutée à ton suivi');
  }
  refreshView();
}
function findRow(id) { const d = deptOf.get(id); return d ? (cache.get(d) || []).find(r => r[0] === id) : null; }
function renderSuivi() {
  const ids = Object.keys(suivi).sort((a, b) => suivi[b].updated - suivi[a].updated);
  const counts = {}; ids.forEach(id => counts[suivi[id].status] = (counts[suivi[id].status] || 0) + 1);
  $('#suivi-filter').innerHTML = [['tous', 'Toutes', ids.length], ...STATUTS.map(s => [s[0], s[1], counts[s[0]] || 0])]
    .filter(x => x[0] === 'tous' || x[2]).map(x => '<button class="chip" data-sf="' + x[0] + '" aria-pressed="' + (suiviFilter === x[0]) + '">' + esc(x[1]) + ' · ' + x[2] + '</button>').join('');
  const list = ids.filter(id => suiviFilter === 'tous' || suivi[id].status === suiviFilter);
  $('#suivi-list').innerHTML = list.length ? list.map(id => {
    const s = suivi[id];
    return '<li class="card track"><div><h2>' + esc(s.t) + '</h2><p class="who">' + esc(s.e) + (s.c ? ' · ' + esc(s.c) : '') + '</p></div>' +
      '<button class="star" data-star="' + esc(id) + '" aria-pressed="true" aria-label="Retirer de mon suivi">★</button>' +
      '<div class="row"><label class="src" for="st-' + esc(id) + '">Statut</label><select id="st-' + esc(id) + '" data-status="' + esc(id) + '">' + STATUTS.map(x => '<option value="' + x[0] + '"' + (x[0] === s.status ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select>' +
      '<button class="btn sm ghost" data-open="' + esc(id) + '">Voir l’offre</button>' + (s.u ? '<a class="btn sm ghost" href="' + esc(s.u) + '" target="_blank" rel="noopener">Postuler</a>' : '') +
      '<span class="src">Mise à jour ' + new Date(s.updated).toLocaleDateString('fr-FR') + '</span></div>' +
      '<textarea data-note="' + esc(id) + '" placeholder="Notes : contact, date d’envoi, relance prévue…" aria-label="Notes">' + esc(s.note || '') + '</textarea></li>';
  }).join('') : '<li class="empty"><b>' + (ids.length ? 'Aucune offre avec ce statut.' : 'Ton suivi est vide.') + '</b><span>Touche l’étoile ☆ sur une offre pour la garder ici et suivre ta candidature.</span></li>';
}
document.addEventListener('change', e => {
  const id = e.target.dataset?.status;
  if (id && suivi[id]) { suivi[id].status = e.target.value; suivi[id].updated = Date.now(); saveSuivi(); renderSuivi(); }
});
let nT;
document.addEventListener('input', e => {
  const id = e.target.dataset?.note;
  if (id && suivi[id]) { suivi[id].note = e.target.value; clearTimeout(nT); nT = setTimeout(() => { suivi[id].updated = Date.now(); LS.set('suivi', suivi); }, 400); }
});
$('#export').addEventListener('click', async () => {
  const txt = Object.values(suivi).map(s => '- ' + s.t + ' — ' + s.e + (s.c ? ' (' + s.c + ')' : '') + ' : ' + (STATUT_NAME[s.status] || s.status) + (s.u ? ' — ' + s.u : '') + (s.note ? '\n  Notes : ' + s.note : '')).join('\n');
  try { await navigator.clipboard.writeText(txt || 'Suivi vide'); toast('Suivi copié'); } catch (err) { toast('Copie impossible sur ce navigateur'); }
});

/* ---------- alertes ---------- */
function describe(ff) {
  const loc = ff.loc === 'FR' ? 'Toute la France' : ff.loc.startsWith('R:') ? ff.loc.slice(2) : (DEPT_NAME[ff.loc.slice(2)] || ff.loc.slice(2)) + ' (' + ff.loc.slice(2) + ')';
  return [ff.q ? '« ' + ff.q + ' »' : 'Tous métiers', loc, ff.kind === 'all' ? 'Alternance et stage' : ff.kind == 1 ? 'Stage' : 'Alternance',
    ff.dom ? (DOMAINS.find(d => d[0] === ff.dom) || [])[1] : '', +ff.lvl ? LEVELS[ff.lvl] : ''].filter(Boolean).join(' · ');
}
$('#save-alert').addEventListener('click', () => {
  const ff = { q: f.q, loc: f.loc, kind: f.kind, dom: f.dom, lvl: f.lvl, since: 0 };
  if (alertes.some(a => JSON.stringify(a.f) === JSON.stringify(ff))) { toast('Cette alerte existe déjà'); return; }
  alertes.push({ id: Date.now().toString(36), f: ff, seenHour: meta?.nowHour || Math.floor(Date.now() / 36e5), created: Date.now() });
  LS.set('alertes', alertes); updateCounts(); toast('Alerte créée : retrouve-la dans l’onglet Alertes');
});
function alertNew(a) {
  const m = matcher(a.f); let n = 0, total = 0;
  for (const d of deptsForLoc(a.f.loc)) for (const r of cache.get(d) || []) if (m(r)) { total++; if (r[6] > a.seenHour) n++; }
  return { n, total };
}
async function computeAlerts() {
  if (!alertes.length || !meta) return;
  await loadDepts([...new Set(alertes.flatMap(a => deptsForLoc(a.f.loc)))]);
  updateCounts();
  if (tab === 'alertes') renderAlertes();
}
function renderAlertes() {
  $('#alert-list').innerHTML = alertes.length ? alertes.map(a => {
    const { n, total } = alertNew(a);
    return '<li class="alert"><div class="row"><h2>' + esc(describe(a.f)) + '</h2><span class="big' + (n ? '' : ' zero') + '">' + n + '</span></div>' +
      '<p class="crit">' + (n ? n + ' nouvelle' + (n > 1 ? 's' : '') + ' offre' + (n > 1 ? 's' : '') + ' depuis ta dernière consultation' : 'Pas de nouvelle offre depuis ta dernière consultation') + ' · ' + total + ' au total</p>' +
      '<div class="row"><button class="btn sm" data-alert-open="' + a.id + '">Voir les offres</button><button class="btn sm danger" data-alert-del="' + a.id + '">Supprimer</button></div></li>';
  }).join('') : '<li class="empty"><b>Aucune alerte.</b><span>Fais une recherche dans l’onglet Offres puis touche « Créer une alerte pour cette recherche ».</span></li>';
}
function updateCounts() {
  const ns = Object.keys(suivi).length;
  $('#n-suivi').hidden = !ns; $('#n-suivi').textContent = ns;
  const na = meta ? alertes.reduce((s, a) => s + alertNew(a).n, 0) : 0;
  $('#n-alertes').hidden = !na; $('#n-alertes').textContent = na > 999 ? '999+' : na;
}

/* ---------- fiche d'une offre ---------- */
const dlg = $('#detail');
async function openDetail(id) {
  $('#d-body').innerHTML = '<div class="skel"></div>';
  if (!dlg.open) dlg.showModal();
  history.replaceState(null, '', '#offre=' + encodeURIComponent(id));
  const d = await getDetail(id);
  if (!d) { $('#d-body').innerHTML = '<div class="empty"><b>Cette offre n’est plus disponible.</b><span>Elle a probablement été pourvue ou retirée par l’employeur.</span></div>'; return; }
  const saved = !!suivi[id];
  const facts = [
    ['Lieu', [d.c, d.d && d.d !== '00' ? (DEPT_NAME[d.d] || d.d) + ' (' + d.d + ')' : ''].filter(Boolean).join(', ')],
    ['Contrat', d.co], ['Début', d.st ? new Date(d.st).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : ''],
    ['Durée', d.du ? (/^\d+$/.test(String(d.du)) ? d.du + ' mois' : d.du) : ''], ['Niveau visé', d.lv || LEVELS[d.l] || ''],
    ['Télétravail', { onsite: 'Sur place', hybrid: 'Hybride', remote: 'Télétravail' }[d.re] || ''], ['Salaire', d.sa], ['Secteur', d.se],
    ['Publiée', d.cr ? new Date(d.cr).toLocaleDateString('fr-FR') : ''],
  ].filter(x => x[1]);
  $('#d-body').innerHTML = '<div class="d-head"><span><span class="tag k' + d.k + '">' + (d.k === 1 ? 'Stage' : 'Alternance') + '</span></span><h2 id="d-title">' + esc(d.t) + '</h2><p class="who">' + esc(d.e) + '</p></div>' +
    '<div class="facts">' + facts.map(x => '<div class="fact"><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>').join('') + '</div>' +
    (d.sk && d.sk.length ? '<p class="src">Compétences : ' + esc(d.sk.join(', ')) + '</p>' : '') +
    '<div class="actions">' + (d.u ? '<a class="btn" href="' + esc(d.u) + '" target="_blank" rel="noopener">Postuler sur le site de l’offre</a>' : '') +
    '<button class="btn ghost" data-star="' + esc(id) + '" aria-pressed="' + saved + '">' + (saved ? '★ Dans mon suivi' : '☆ Garder dans mon suivi') + '</button>' +
    '<button class="btn ghost" id="d-share" type="button">Partager</button></div>' +
    '<div class="desc">' + esc(d.x || 'Pas de description fournie. Ouvre l’offre d’origine pour plus de détails.') + '</div>' +
    '<p class="src">Source : ' + esc(d.s) + '. Vérifie toujours l’offre sur le site d’origine avant de postuler.</p>';
  $('#d-share').onclick = async () => {
    const url = location.href;
    try { if (navigator.share) await navigator.share({ title: d.t, text: d.t + ' — ' + d.e, url }); else { await navigator.clipboard.writeText(url); toast('Lien copié'); } } catch (e) {}
  };
}
dlg.addEventListener('close', () => { if (location.hash.startsWith('#offre=')) history.replaceState(null, '', location.pathname + location.search); });
$('#d-close').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

/* ---------- onglets et clics ---------- */
function setTab(t) {
  tab = t;
  document.querySelectorAll('.tab').forEach(b => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  ['offres', 'suivi', 'alertes'].forEach(v => ($('#view-' + v).hidden = v !== t));
  if (t === 'suivi') renderSuivi();
  if (t === 'alertes') { renderAlertes(); computeAlerts(); }
  window.scrollTo({ top: 0 });
}
function refreshView() { if (tab === 'offres') renderResults(); if (tab === 'suivi') renderSuivi(); if (dlg.open) { const m = location.hash.match(/offre=([^&]+)/); if (m) openDetail(decodeURIComponent(m[1])); } }
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]'); if (t) { e.preventDefault(); setTab(t.dataset.tab); return; }
  const s = e.target.closest('[data-star]'); if (s) { e.stopPropagation(); toggleStar(s.dataset.star); return; }
  const sf = e.target.closest('[data-sf]'); if (sf) { suiviFilter = sf.dataset.sf; renderSuivi(); return; }
  const ao = e.target.closest('[data-alert-open]');
  if (ao) {
    const a = alertes.find(x => x.id === ao.dataset.alertOpen); if (!a) return;
    a.seenHour = meta?.nowHour || Math.floor(Date.now() / 36e5); LS.set('alertes', alertes);
    Object.assign(f, a.f, { since: 0 }); fillSelects(); setTab('offres'); runSearch(); updateCounts(); return;
  }
  const ad = e.target.closest('[data-alert-del]');
  if (ad) { alertes = alertes.filter(x => x.id !== ad.dataset.alertDel); LS.set('alertes', alertes); renderAlertes(); updateCounts(); return; }
  if (e.target.closest('textarea,select,a')) return;
  const o = e.target.closest('[data-open]'); if (o) openDetail(o.dataset.open);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.card[data-open]')) openDetail(e.target.dataset.open); });

/* ---------- demarrage ---------- */
async function boot() {
  fillSelects();
  updateCounts();
  try { meta = await getJSON('data/meta.json'); }
  catch (e) { $('#stats').textContent = 'Les offres ne sont pas encore disponibles. Réessaie dans quelques minutes.'; $('#results').innerHTML = ''; return; }
  const upd = new Date(meta.updated);
  $('#stats').innerHTML = '<b>' + meta.counts.alternance.toLocaleString('fr-FR') + '</b> offres d’alternance et <b>' + meta.counts.stage.toLocaleString('fr-FR') + '</b> offres de stage partout en France. Mise à jour le ' + upd.toLocaleDateString('fr-FR') + ' à ' + upd.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '.';
  $('#sources-line').textContent = 'Sources : ' + meta.sourceCounts.slice(0, 12).map(([s, n]) => s + ' (' + n.toLocaleString('fr-FR') + ')').join(', ') + (meta.sourceCounts.length > 12 ? '…' : '') + '.';
  await runSearch(false);
  const m = location.hash.match(/offre=([^&]+)/); if (m) openDetail(decodeURIComponent(m[1]));
  computeAlerts();
  setTimeout(() => LS.set('lastVisit', meta.nowHour || Math.floor(Date.now() / 36e5)), 5000);
}
boot();
})();
