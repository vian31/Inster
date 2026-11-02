# Inster Compteur

PWA de suivi du leasing de la Hyundai Inster : kilométrage (15 000 km/an, 36 mois), kWh côté prise, conso myHyundai, €/100 km et comparaison avec un diesel.

## Données
Les données restent uniquement dans le navigateur du téléphone (localStorage) : rien n'est envoyé ni stocké sur ce dépôt. La sauvegarde se fait par un fichier JSON, depuis Réglages. Ne pas déposer ces fichiers ici.

## Publication
Fichiers statiques sans étape de compilation. Settings > Pages > Deploy from a branch > `main` / `(root)`.

Après une modification, changer `CACHE` dans `sw.js`.
