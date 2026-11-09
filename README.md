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

## Sonde de température de la prise
Un ESP32 (SHT40 dans la prise, DS18B20 pour l'ambiante) mesure la prise de recharge et alerte via ntfy. L'app affiche la carte « Prise » (thermomètre) dans Bilan pendant une charge, les courbes de chaque recharge dans Historique et les seuils dans Réglages. Les écarts s'affichent en °C au-dessus de l'ambiante.

Le début de charge est la première saisie du % batterie (onglet Saisir) ; l'app l'écrit dans `prise/charge` et la sonde passe alors en mesure rapide. Chaque recharge enregistrée garde `debut` et `fin` (ms) pour retrouver ses mesures, et `ecartMax` / `tpMax` une fois calculés.

| Document | Écrit par | Contenu |
|---|---|---|
| `prise/etat` | sonde | `t` (ms), `tp` prise °C, `ta` ambiante °C, `hr` %, `rssi`, `fw`, `tend` (°C/10 min, facultatif) |
| `prise/charge` | app | `active`, `debut` (ms), `socA`, `amps`, `maj` |
| `prise/config` | app | `alerte`, `alarme` (écarts °C), `tmax` (°C), `ntfy`, `test` (ms : demande une notification de test) |
| `priseMesures/{lot}` | sonde | `t0`, `t1` (ms), tableaux parallèles `t`, `tp`, `ta`, `hr` |

Règles : voir `firestore.rules` (remplacer les deux UID avant de publier).
