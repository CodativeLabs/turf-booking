const createOverlay = document.getElementById("createOverlay");
const passwordStep = document.getElementById("passwordStep");
const createForm = document.getElementById("createForm");
const hostPassInput = document.getElementById("hostPass");
const passError = document.getElementById("passError");
const gamesList = document.getElementById("gamesList");
const emptyState = document.getElementById("emptyState");
const toast = document.getElementById("toast");

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

document.getElementById("openCreateBtn").addEventListener("click", () => {
  createOverlay.classList.remove("hidden");
  passwordStep.style.display = "block";
  createForm.style.display = "none";
  hostPassInput.value = "";
  passError.style.display = "none";
});

document.getElementById("cancelPassBtn").addEventListener("click", () => {
  createOverlay.classList.add("hidden");
});
document.getElementById("cancelCreateBtn").addEventListener("click", () => {
  createOverlay.classList.add("hidden");
});

document.getElementById("checkPassBtn").addEventListener("click", () => {
  if (unlockHost(hostPassInput.value.trim())) {
    passwordStep.style.display = "none";
    createForm.style.display = "block";
    // pre-fill host name/phone if we know them already
    const me = getMyIdentity();
    if (me) {
      document.getElementById("hostName").value = me.name;
      document.getElementById("hostPhone").value = me.phone;
    }
  } else {
    passError.style.display = "block";
  }
});

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hostName = document.getElementById("hostName").value.trim();
  const hostPhone = document.getElementById("hostPhone").value.trim();
  const date = document.getElementById("gameDate").value;
  const time = document.getElementById("gameTime").value;
  const venue = document.getElementById("gameVenue").value.trim();
  const cost = Number(document.getElementById("gameCost").value);

  if (!hostName || !hostPhone || !date || !time || !venue || !cost) return;

  saveMyIdentity(hostName, hostPhone);

  const gameId = generateGameId();
  const submitBtn = createForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating...";

  try {
    await db.collection("games").doc(gameId).set({
      hostName,
      hostPhone,
      date,
      time,
      venue,
      totalCost: cost,
      phase: "confirming", // confirming -> played
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // host auto-joins as a confirmed player (doc id = phone digits, so each phone = one row)
    const phoneId = hostPhone.replace(/\D/g, "");
    await db.collection("games").doc(gameId).collection("players").doc(phoneId).set({
      name: hostName,
      phone: hostPhone,
      status: "confirmed",
      addedLate: false,
      played: null,
      paid: false,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    window.location.href = `game.html?id=${gameId}`;
  } catch (err) {
    console.error(err);
    showToast("Couldn't create game. Check your Firebase setup.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Game";
  }
});

// Realtime list of games, newest first
db.collection("games")
  .orderBy("createdAt", "desc")
  .onSnapshot(
    (snap) => {
      if (snap.empty) {
        gamesList.innerHTML = "";
        emptyState.style.display = "block";
        return;
      }
      emptyState.style.display = "none";
      gamesList.innerHTML = "";

      snap.forEach((doc) => {
        const g = doc.data();
        const card = document.createElement("a");
        card.className = "card game-card";
        card.href = `game.html?id=${doc.id}`;

        const badge = g.phase === "played"
          ? `<span class="badge completed">Completed</span>`
          : `<span class="badge">Confirming</span>`;

        card.innerHTML = `
          ${badge}
          <h3>${escapeHtml(g.venue)}</h3>
          <div class="meta">📅 ${formatDate(g.date)} · 🕒 ${g.time}</div>
          <div class="meta">Hosted by ${escapeHtml(g.hostName)}</div>
        `;

        // live player count
        db.collection("games").doc(doc.id).collection("players")
          .where("status", "==", "confirmed")
          .onSnapshot((psnap) => {
            const el = document.createElement("div");
            el.className = "count";
            el.textContent = `${psnap.size} confirmed`;
            const existing = card.querySelector(".count");
            if (existing) existing.remove();
            card.appendChild(el);
          });

        gamesList.appendChild(card);
      });
    },
    (err) => {
      console.error(err);
      gamesList.innerHTML = `<div class="empty-state">Couldn't load games. Check your Firebase setup in js/firebase-config.js.</div>`;
    }
  );

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}