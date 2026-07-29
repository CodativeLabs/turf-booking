const params = new URLSearchParams(window.location.search);
const gameId = params.get("id");
const gameContent = document.getElementById("gameContent");
const toast = document.getElementById("toast");
const joinOverlay = document.getElementById("joinOverlay");
const hostOverlay = document.getElementById("hostOverlay");

let currentGame = null;
let currentPlayers = [];

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function phoneDigits(p) {
  return (p || "").replace(/\D/g, "");
}

if (!gameId) {
  gameContent.innerHTML = `<div class="card empty-state">Game not found.</div>`;
} else {
  init();
}

function init() {
  const me = getMyIdentity();
  if (!me) {
    joinOverlay.classList.remove("hidden");
  }

  const gameRef = db.collection("games").doc(gameId);

  gameRef.onSnapshot((doc) => {
    if (!doc.exists) {
      gameContent.innerHTML = `<div class="card empty-state">This game doesn't exist or was removed.</div>`;
      return;
    }
    currentGame = doc.data();
    render();
  });

  gameRef.collection("players").orderBy("joinedAt", "asc").onSnapshot((snap) => {
    currentPlayers = [];
    snap.forEach((d) => currentPlayers.push({ id: d.id, ...d.data() }));
    render();
  });
}

// ---------- Join popup ----------
document.getElementById("joinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("joinName").value.trim();
  const phone = document.getElementById("joinPhone").value.trim();
  if (!name || !phone) return;

  saveMyIdentity(name, phone);
  joinOverlay.classList.add("hidden");

  const pid = phoneDigits(phone);
  const playerRef = db.collection("games").doc(gameId).collection("players").doc(pid);
  const existing = await playerRef.get();
  if (!existing.exists) {
    await playerRef.set({
      name,
      phone,
      status: "maybe",
      addedLate: false,
      played: null,
      paid: false,
      joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
});

// ---------- Host unlock popup ----------
document.getElementById("hostUnlockCancel").addEventListener("click", () => {
  hostOverlay.classList.add("hidden");
});
document.getElementById("hostUnlockBtn").addEventListener("click", () => {
  const val = document.getElementById("hostUnlockPass").value.trim();
  if (unlockHost(val)) {
    hostOverlay.classList.add("hidden");
    document.getElementById("hostUnlockError").style.display = "none";
    render();
  } else {
    document.getElementById("hostUnlockError").style.display = "block";
  }
});

function openHostUnlock() {
  document.getElementById("hostUnlockPass").value = "";
  document.getElementById("hostUnlockError").style.display = "none";
  hostOverlay.classList.remove("hidden");
}

// ---------- Rendering ----------
function render() {
  if (!currentGame) return;
  const me = getMyIdentity();
  const myId = me ? phoneDigits(me.phone) : null;
  const hostUnlocked = isHostUnlocked();

  const confirmedCount = currentPlayers.filter((p) => p.status === "confirmed").length;
  const maybeCount = currentPlayers.filter((p) => p.status === "maybe").length;
  const outCount = currentPlayers.filter((p) => p.status === "out").length;

  const phaseBadge = currentGame.phase === "played"
    ? `<span class="badge completed">Completed</span>`
    : `<span class="badge">Confirming</span>`;

  const shareUrl = window.location.href;

  let html = `
    <div class="card">
      ${phaseBadge}
      <h3 style="margin-top:4px;">${escapeHtml(currentGame.venue)}</h3>
      <div class="meta">📅 ${formatDate(currentGame.date)} · 🕒 ${currentGame.time}</div>
      <div class="meta">Hosted by ${escapeHtml(currentGame.hostName)} (${escapeHtml(currentGame.hostPhone)})</div>
      <div class="meta">💰 Total cost: ₹${currentGame.totalCost}</div>

      <div class="copy-link-row">
        <input type="text" readonly value="${shareUrl}" id="shareUrlInput" />
        <button class="btn-secondary btn-small" id="copyLinkBtn">Copy</button>
      </div>

      ${hostUnlocked
        ? `<div class="meta" style="margin-top:10px;color:var(--green-deep);font-weight:700;">✓ Host controls unlocked</div>`
        : `<button class="btn-secondary btn-small" style="margin-top:12px;" id="hostUnlockOpenBtn">Manage as host</button>`
      }
    </div>

    <div class="card">
      <h2>Players</h2>
      <div class="summary-row"><span>✅ Confirmed</span><span>${confirmedCount}</span></div>
      <div class="summary-row"><span>❓ Maybe</span><span>${maybeCount}</span></div>
      <div class="summary-row"><span>❌ Can't play</span><span>${outCount}</span></div>
      <div style="margin-top:10px;">
        ${currentPlayers.length === 0
          ? `<div class="empty-state">No one's responded yet.</div>`
          : currentPlayers.map((p) => renderPlayerRow(p, myId, hostUnlocked)).join("")}
      </div>
    </div>
  `;

  if (hostUnlocked && currentGame.phase === "confirming") {
    html += `
      <div class="card">
        <h2>Add a Player</h2>
        <p class="hint">For anyone who isn't confirming themselves on the link.</p>
        <form id="hostAddForm">
          <label for="addName">Name</label>
          <input type="text" id="addName" required placeholder="Name" />
          <label for="addPhone">Phone</label>
          <input type="tel" id="addPhone" required placeholder="Phone number" />
          <button type="submit" class="btn-primary btn-small" style="width:100%;">Add Player</button>
        </form>
      </div>

      <div class="card">
        <h2>Ready to Play?</h2>
        <p class="hint">Once you lock the game, you'll mark who actually showed up and split the cost between them.</p>
        <button class="btn-primary" id="lockGameBtn">Mark Attendance & Split Payment</button>
      </div>
    `;
  }

  if (currentGame.phase === "played") {
    const eligiblePlayers = currentPlayers.filter((p) => p.status !== "out");
    html += `
      <div class="card">
        <h2>Attendance</h2>
        <p class="hint">${hostUnlocked ? "Tap to mark who actually played." : "Who showed up on the day."}</p>
        ${eligiblePlayers.map((p) => renderAttendanceRow(p, hostUnlocked)).join("")}
      </div>
    `;

    const playedPlayers = currentPlayers.filter((p) => p.played === true);
    const perHead = playedPlayers.length > 0
      ? Math.ceil(currentGame.totalCost / playedPlayers.length)
      : 0;
    const paidCount = playedPlayers.filter((p) => p.paid).length;
    const collected = paidCount * perHead;

    html += `
      <div class="card">
        <h2>Payment Split</h2>
        <div class="summary-row"><span>Players who played</span><span>${playedPlayers.length}</span></div>
        <div class="summary-row"><span>Per person</span><span>₹${perHead}</span></div>
        <div class="summary-row total"><span>Collected / Total</span><span>₹${collected} / ₹${currentGame.totalCost}</span></div>
        <div style="margin-top:10px;">
          ${playedPlayers.length === 0
            ? `<div class="empty-state">No one marked as played yet.</div>`
            : playedPlayers.map((p) => renderPaidRow(p, perHead, hostUnlocked)).join("")}
        </div>
        <p class="hint" style="margin-top:12px;">Pay ${escapeHtml(currentGame.hostName)} (${escapeHtml(currentGame.hostPhone)}) directly — this just tracks who's settled up.</p>
      </div>
    `;
  }

  gameContent.innerHTML = html;
  attachHandlers(myId, hostUnlocked);
}

function renderPlayerRow(p, myId, hostUnlocked) {
  const canEdit = hostUnlocked || p.id === myId;
  const initial = (p.name || "?").charAt(0).toUpperCase();
  const lateTag = p.addedLate ? `<span class="late-tag">LATE ADD</span>` : "";

  let control;
  if (canEdit) {
    control = `
      <div class="status-switch" data-pid="${p.id}">
        <button class="status-pill confirmed ${p.status === "confirmed" ? "" : "faded"}" data-status="confirmed" style="opacity:${p.status === "confirmed" ? "1" : "0.4"}">In</button>
        <button class="status-pill maybe" data-status="maybe" style="opacity:${p.status === "maybe" ? "1" : "0.4"}">Maybe</button>
        <button class="status-pill out" data-status="out" style="opacity:${p.status === "out" ? "1" : "0.4"}">Out</button>
      </div>
    `;
  } else {
    const cls = p.status === "confirmed" ? "confirmed" : p.status === "maybe" ? "maybe" : "out";
    const label = p.status === "confirmed" ? "In" : p.status === "maybe" ? "Maybe" : "Out";
    control = `<span class="status-pill ${cls}">${label}</span>`;
  }

  const lateToggle = canEdit
    ? `<button class="toggle-chip ${p.addedLate ? "on" : ""} late-toggle" data-pid="${p.id}" data-current="${p.addedLate ? "yes" : "no"}" style="margin-left:8px;">Late?</button>`
    : "";

  return `
    <div class="player-row">
      <div class="player-info">
        <div class="avatar">${initial}</div>
        <div>
          <div class="player-name">${escapeHtml(p.name)}${lateTag}</div>
          <div class="player-phone">${escapeHtml(p.phone)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;">${control}${lateToggle}</div>
    </div>
  `;
}

function renderAttendanceRow(p, hostUnlocked) {
  const played = p.played === true;
  const chip = hostUnlocked
    ? `<button class="toggle-chip ${played ? "on" : ""} played-toggle" data-pid="${p.id}" data-current="${played ? "yes" : "no"}">${played ? "Played ✓" : "Didn't play"}</button>`
    : `<span class="toggle-chip ${played ? "on" : ""}">${played ? "Played ✓" : "Didn't play"}</span>`;

  return `
    <div class="attend-row">
      <div class="player-name">${escapeHtml(p.name)}</div>
      ${chip}
    </div>
  `;
}

function renderPaidRow(p, amount, hostUnlocked) {
  const chip = hostUnlocked
    ? `<button class="toggle-chip ${p.paid ? "on" : ""} paid-toggle" data-pid="${p.id}" data-current="${p.paid ? "yes" : "no"}">${p.paid ? "Paid ✓" : "Unpaid"}</button>`
    : `<span class="toggle-chip ${p.paid ? "on" : ""}">${p.paid ? "Paid ✓" : "Unpaid"}</span>`;

  return `
    <div class="paid-row">
      <div>
        <div class="player-name">${escapeHtml(p.name)}</div>
        <div class="player-phone amount">₹${amount}</div>
      </div>
      ${chip}
    </div>
  `;
}

// ---------- Event delegation for dynamic content ----------
function attachHandlers(myId, hostUnlocked) {
  const copyBtn = document.getElementById("copyLinkBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const input = document.getElementById("shareUrlInput");
      input.select();
      navigator.clipboard.writeText(input.value).then(() => showToast("Link copied!"));
    });
  }

  const hostBtn = document.getElementById("hostUnlockOpenBtn");
  if (hostBtn) hostBtn.addEventListener("click", openHostUnlock);

  document.querySelectorAll(".status-switch button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pid = btn.parentElement.getAttribute("data-pid");
      const status = btn.getAttribute("data-status");
      await db.collection("games").doc(gameId).collection("players").doc(pid).update({ status });
    });
  });

  document.querySelectorAll(".late-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pid = btn.getAttribute("data-pid");
      const current = btn.getAttribute("data-current") === "yes";
      await db.collection("games").doc(gameId).collection("players").doc(pid).update({ addedLate: !current });
    });
  });

  document.querySelectorAll(".played-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pid = btn.getAttribute("data-pid");
      const current = btn.getAttribute("data-current") === "yes";
      await db.collection("games").doc(gameId).collection("players").doc(pid).update({ played: !current });
    });
  });

  document.querySelectorAll(".paid-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pid = btn.getAttribute("data-pid");
      const current = btn.getAttribute("data-current") === "yes";
      await db.collection("games").doc(gameId).collection("players").doc(pid).update({ paid: !current });
    });
  });

  const lockBtn = document.getElementById("lockGameBtn");
  if (lockBtn) {
    lockBtn.addEventListener("click", async () => {
      lockBtn.disabled = true;
      lockBtn.textContent = "Locking...";
      const batch = db.batch();
      const gameRef = db.collection("games").doc(gameId);
      batch.update(gameRef, { phase: "played" });
      currentPlayers.forEach((p) => {
        const pRef = gameRef.collection("players").doc(p.id);
        batch.update(pRef, { played: p.status === "confirmed" });
      });
      await batch.commit();
    });
  }

  const addForm = document.getElementById("hostAddForm");
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("addName").value.trim();
      const phone = document.getElementById("addPhone").value.trim();
      if (!name || !phone) return;
      const pid = phoneDigits(phone);
      await db.collection("games").doc(gameId).collection("players").doc(pid).set({
        name,
        phone,
        status: "confirmed",
        addedLate: true,
        played: null,
        paid: false,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      addForm.reset();
      showToast(`${name} added`);
    });
  }
}