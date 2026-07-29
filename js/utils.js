// Shared helpers used on both index.html and game.html

function generateGameId() {
  // short, readable, unique-enough id e.g. "g7k2m9"
  return "g" + Math.random().toString(36).substring(2, 8);
}

function getMyIdentity() {
  const name = localStorage.getItem("turf_name");
  const phone = localStorage.getItem("turf_phone");
  if (!name || !phone) return null;
  return { name, phone };
}

function saveMyIdentity(name, phone) {
  localStorage.setItem("turf_name", name);
  localStorage.setItem("turf_phone", phone);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function isHostUnlocked() {
  return sessionStorage.getItem("turf_host_unlocked") === "yes";
}

function unlockHost(passwordEntered) {
  if (passwordEntered === HOST_PASSWORD) {
    sessionStorage.setItem("turf_host_unlocked", "yes");
    return true;
  }
  return false;
}