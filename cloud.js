// Synchronisation Firestore. Le localStorage reste la source immédiate (l'app marche hors connexion),
// Firestore garde une copie dans le document users/{uid}. Le champ rev (horodatage) départage les deux.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp, collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

// Cette configuration n'est pas secrète : l'accès est protégé par la connexion Google et les règles Firestore.
const app = initializeApp({
  apiKey: "AIzaSyBvuYN0kZxTdh3-DNLaobfcVImaKt76jGQ",
  authDomain: "inster-a7e5d.firebaseapp.com",
  projectId: "inster-a7e5d",
  storageBucket: "inster-a7e5d.firebasestorage.app",
  messagingSenderId: "257359093264",
  appId: "1:257359093264:web:84c403f84459754406f495"
});
const auth = getAuth(app), db = getFirestore(app);
const LINK = "inster-cloud-uid", BEFORE = "inster-compteur-avant-synchro";
const $ = s => document.querySelector(s);
const msg = t => typeof toast === "function" && toast(t);
let user = null, unsub = null, timer = null, last = null, err = "";

const ref = () => doc(db, "users", user.uid);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const hasData = s => s.readings.length || s.charges.length;

async function push() {
  clearTimeout(timer); timer = null;
  if (!user) return;
  const s = JSON.parse(JSON.stringify(window.Inster.state())); // retire les undefined refusés par Firestore
  if (!s.rev) s.rev = Date.now();
  try {
    await setDoc(ref(), { rev: s.rev, state: s, updatedAt: serverTimestamp() });
    last = new Date(); err = ""; paint();
  } catch (e) { err = "Envoi impossible : " + e.code; paint(); }
}
window.cloudPush = () => { if (user) { clearTimeout(timer); timer = setTimeout(push, 800); } };

function listen() {
  unsub = onSnapshot(ref(), snap => {
    // fromCache : réponse locale (hors connexion), le document peut sembler absent alors qu'il existe sur le serveur
    if (snap.metadata.hasPendingWrites || snap.metadata.fromCache) return;
    const r = snap.exists() ? snap.data() : null, local = window.Inster.state();
    const lr = local.rev || 0, rr = (r && r.rev) || 0;
    const firstLink = localStorage.getItem(LINK) !== user.uid;
    if (!r) push(); // premier passage : les données du téléphone partent sur Firestore
    else if (firstLink || rr > lr) {
      // téléphone pas encore lié à ce compte : Firestore fait foi, on garde une copie locale par sécurité
      if (firstLink && hasData(local) && rr !== lr) { localStorage.setItem(BEFORE, JSON.stringify(local)); msg("Données du compte récupérées. L'ancienne version locale est gardée de côté."); }
      if (rr !== lr) window.Inster.adopt(r.state);
      last = new Date();
    } else if (lr > rr) push();
    else last = new Date();
    localStorage.setItem(LINK, user.uid);
    err = ""; paint();
  }, e => { unsub = null; err = "Lecture impossible : " + e.code; paint(); }); // relancé par le bouton Synchroniser
}

// ---- Sonde de température de la prise (voir app.js et le firmware ESP32) ----
// prise/etat : dernière mesure (sonde) · prise/charge : charge en cours (app) · prise/config : seuils (app)
// priseMesures/{lot} : { t0, t1, t:[ms], tp:[°C], ta:[°C], hr:[%] } (sonde)
let pzUnsubs = [];
const pz = (k, v) => window.Inster && window.Inster.prise && window.Inster.prise(k, v);
const pzDenied = e => pz("err", e.code === "permission-denied" ? "Accès refusé : publier les règles Firestore de la sonde (voir README)." : "Lecture de la sonde impossible : " + e.code);
function pzListen() {
  pzUnsubs.push(onSnapshot(doc(db, "prise", "etat"), s => { pz("err", ""); pz("live", s.exists() ? s.data() : null); }, pzDenied));
  pzUnsubs.push(onSnapshot(doc(db, "prise", "config"), s => { if (s.exists()) pz("cfg", s.data()); }, () => {}));
}
function pzStop() { pzUnsubs.forEach(u => u()); pzUnsubs = []; pz("live", null); }
window.Prise = {
  ok: () => !!user,
  setCharge: o => user ? setDoc(doc(db, "prise", "charge"), { ...o, maj: Date.now() }).catch(() => {}) : Promise.resolve(),
  setCfg: o => user ? setDoc(doc(db, "prise", "config"), o, { merge: true }) : Promise.reject(new Error("non connecté")),
  // mesures entre a et b (ms) : les lots commencent au plus 1 h avant a
  mesures: async (a, b) => {
    const q = query(collection(db, "priseMesures"), where("t0", ">=", a - 36e5), where("t0", "<=", b), orderBy("t0"));
    const out = [];
    (await getDocs(q)).forEach(d => {
      const x = d.data();
      (x.t || []).forEach((t, i) => { if (t >= a && t <= b) out.push({ t, tp: x.tp?.[i] ?? null, ta: x.ta?.[i] ?? null, hr: x.hr?.[i] ?? null }); });
    });
    return out.sort((p, q2) => p.t - q2.t);
  }
};

onAuthStateChanged(auth, u => {
  if (unsub) { unsub(); unsub = null; }
  pzStop();
  user = u; last = null; err = "";
  if (u) { listen(); pzListen(); }
  paint();
});

function paint() {
  const box = $("#cloud");
  if (!box) return;
  const hm = d => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  box.innerHTML = user
    ? `<p class="small">Connecté : ${esc(user.email)}</p>
       <p class="small muted">${err ? err : last ? "Synchronisé à " + hm(last) + "." : "Synchronisation en cours…"} Chaque saisie est envoyée automatiquement.</p>
       <div class="row"><button class="btn ghost" id="cloudNow">Synchroniser</button><button class="btn ghost" id="cloudOut">Se déconnecter</button></div>`
    : `<p class="small muted">Connecte-toi pour copier tes données sur Firestore : elles survivent à un changement de téléphone ou à un effacement du navigateur.</p>
       ${err ? `<p class="err">${err}</p>` : ""}
       <div><button class="btn" id="cloudIn">Se connecter avec Google</button></div>`;
}

// app fermée ou mise en arrière-plan : on n'attend pas la fin du délai
document.addEventListener("visibilitychange", () => { if (document.hidden && timer) push(); });

// render() de app.js recrée la page : on redessine la carte à chaque fois
new MutationObserver(paint).observe($("#view"), { childList: true });
paint();

$("#view").addEventListener("click", async e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "cloudIn") {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (x) {
      if (x.code === "auth/popup-closed-by-user" || x.code === "auth/cancelled-popup-request") return;
      err = x.code === "auth/unauthorized-domain" ? "Domaine non autorisé dans Firebase Authentication." : "Connexion impossible : " + x.code;
      paint();
    }
  }
  if (b.id === "cloudOut") { await signOut(auth); msg("Déconnecté. Les données restent sur le téléphone."); }
  if (b.id === "cloudNow") { if (user && !unsub) listen(); else push(); }
});
