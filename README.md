# Inster Compteur

PWA de suivi du leasing de la Hyundai Inster : kilométrage (15 000 km/an, 36 mois, 6 jours d'usage par semaine et 300 par an, soit 50 km par jour), kWh côté prise, conso myHyundai, €/100 km et comparaison avec un diesel.

## Données
Les données sont gardées dans le navigateur (localStorage), ce qui permet de saisir hors connexion, et copiées dans Firestore (projet Firebase `inster-a7e5d`, document `users/{uid}`) une fois connecté avec Google depuis Réglages. Le champ `rev` (horodatage de la dernière modification) désigne la version la plus récente. Rien n'est stocké sur ce dépôt ; la configuration Firebase de `cloud.js` n'est pas secrète, l'accès est protégé par les règles Firestore :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

L'export JSON depuis Réglages reste disponible comme sauvegarde de secours. Ne pas déposer ces fichiers ici.

## Publication
Fichiers statiques sans étape de compilation. Settings > Pages > Deploy from a branch > `main` / `(root)`.

Après une modification, changer `CACHE` dans `sw.js`.
