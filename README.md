# PDCA — Suivi des Contreparties (BOL Instrument B10)

Tableau de bord PDCA (Plan · Do · Check · Act) pour le suivi des anomalies des
contreparties de câblage — BOL Instrument B10 702 086.

Préparé par **Hamdi Abdeljawed** — Spécialiste Maintenance & Support Technique.

## Fonctionnalités

- Tableau de bord avec KPIs (anomalies suivies, résolues, en cours, délai moyen, priorité haute)
- Filtres par statut / priorité + recherche libre
- Fiches détaillées par anomalie (problème, description technique, actions correctives)
- Galerie photo avec visionneuse (lightbox)
- Export Excel (.xlsx) et PDF de la vue filtrée
- Impression du rapport complet
- Responsive (desktop / tablette / mobile)

## Structure

```
site/
├── index.html          # Page unique de l'application
├── assets/
│   ├── styles.css       # Thème et mise en page
│   ├── app.js            # Logique (rendu, filtres, export, lightbox)
│   ├── data.js            # Données extraites du classeur PDCA (.xlsx)
│   └── photos/             # Photos des anomalies
└── README.md
```

## Déploiement

Ce site est 100% statique (HTML/CSS/JS, sans backend) et peut être publié
directement sur **GitHub Pages** ou **Netlify**.

### GitHub Pages
1. Créez un dépôt GitHub et poussez le contenu de ce dossier à la racine du dépôt.
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Choisissez la branche `main` et le dossier `/ (root)`, puis **Save**.
4. Le site sera disponible à l'adresse `https://<votre-utilisateur>.github.io/<nom-du-depot>/`.

### Netlify
1. Glissez-déposez ce dossier sur [app.netlify.com/drop](https://app.netlify.com/drop),
   ou connectez le dépôt GitHub et laissez le dossier de publication vide (racine).

## Mise à jour des données

Les données sont dans `assets/data.js` (tableau `PDCA_REPORTS`). Chaque rapport
contient un objet `meta` et un tableau `items`. Déposez les nouvelles photos
dans `assets/photos/`.
