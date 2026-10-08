# Alternance & Stages

Application web gratuite qui regroupe les offres d’alternance et de stage en France,
mises à jour automatiquement toutes les 30 minutes.

## Comment ça marche

```
GitHub Actions (toutes les 30 min)
   └─ collector/index.mjs
        ├─ API Apprentissage (La bonne alternance) : export complet des offres d’alternance
        │    (France Travail, Hellowork, PASS fonction publique, LinkedIn, Jobteaser, APEC, Monster…)
        ├─ API France Travail : offres de stage + contrats d’alternance absents de l’export
        └─ Pages carrière des entreprises (collector/companies.json)
   └─ écrit site/data/ (index par département + fiches détaillées)
   └─ publie le dossier site/ sur GitHub Pages
```

Le site (`site/`) est 100 % statique : recherche, filtres, fiche d’offre, suivi des candidatures
et alertes tournent dans le navigateur. Le suivi et les alertes restent sur l’appareil de
l’utilisateur (aucun compte, aucune donnée personnelle collectée).

## Mise en ligne (une seule fois)

1. **Créer le dépôt** : sur GitHub, « New repository », nom par exemple `alternance-stages`,
   visibilité **Public** (GitHub Pages et les minutes d’Actions sont gratuits pour un dépôt public).
   Envoie tout le contenu de ce dossier (bouton « uploading an existing file », ou `git push`).
2. **Activer Pages** : Settings → Pages → Source : **GitHub Actions**.
3. **Ajouter les secrets** : Settings → Secrets and variables → Actions → onglet *Secrets* →
   « New repository secret » :
   - `LBA_API_TOKEN` : ton jeton de l’API Apprentissage (api.apprentissage.beta.gouv.fr, page de ton compte)
   - `FT_CLIENT_ID` et `FT_CLIENT_SECRET` : identifiants de ton application sur francetravail.io
     (abonnée à l’API « Offres d’emploi v2 »)
   Ces secrets ne sont jamais visibles dans le code ni sur le site.
4. **Ajouter la variable** : même page, onglet *Variables* → `SITE_URL` =
   `https://TON-PSEUDO.github.io/alternance-stages` (sert à repérer les nouvelles offres d’une collecte à l’autre).
5. **Lancer la première collecte** : onglet Actions → « Collecte des offres et mise en ligne » →
   « Run workflow ». Au bout de quelques minutes, le site est en ligne à l’adresse de `SITE_URL`.

Ensuite, tout se fait seul toutes les 30 minutes.

## Ajouter des entreprises

`collector/companies.json` liste les entreprises dont on lit la page carrière publique.
Chaque ligne : `{ "name": "Nom affiché", "ats": "greenhouse" | "lever" | "smartrecruiters", "id": "identifiant" }`.
L’identifiant se trouve dans l’adresse de la page carrière, par exemple :
- `boards.greenhouse.io/doctolib` → `greenhouse`, `doctolib`
- `jobs.lever.co/qonto` → `lever`, `qonto` (ajouter `"eu": true` si l’adresse est `jobs.eu.lever.co`)
- `jobs.smartrecruiters.com/Ubisoft2` → `smartrecruiters`, `Ubisoft2`
Seules les offres en France dont l’intitulé parle de stage ou d’alternance sont gardées.

## Changer le nom de l’application

Modifier `APP_NAME` dans `site/config.js`, le `<title>` de `site/index.html` et `name` dans
`site/manifest.webmanifest`.

## Tester sur son ordinateur

```
node collector/index.mjs        # avec les variables LBA_API_TOKEN, FT_CLIENT_ID, FT_CLIENT_SECRET
cd site && python3 -m http.server 8000
```
Options de test : `SKIP_FT=1`, `SKIP_ATS=1`, `LBA_FILE=export.json` (fichier local au lieu de l’API).

## Règles respectées

- Uniquement des sources publiques prévues pour la diffusion (API officielles, flux publics des pages carrière).
  Pas d’aspiration de sites qui l’interdisent (Indeed, LinkedIn, Welcome to the Jungle…).
- Données de l’API Apprentissage : ne pas les revendre (CGU), garder le jeton secret.
- Chaque offre renvoie vers son site d’origine pour postuler.
- GitHub met en pause les tâches planifiées d’un dépôt sans activité pendant 60 jours :
  un e-mail prévient, il suffit de cliquer pour réactiver.
