const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
let user = null;

const $ = (s) => document.querySelector(s);
const views = ["home", "wall", "desk", "auth"];

function show(name) {
  views.forEach((v) => $("#view-" + v).classList.toggle("active", v === name));
}

function hourKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

function tickClock() {
  const now = new Date();
  $("#clock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const next = new Date(now);
  next.setMinutes(60, 0, 0);
  const left = next - now;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  $("#hourLeft").textContent = `${m}m ${String(s).padStart(2, "0")}s until the next feature`;
  $("#hourBar").style.width = `${((3600000 - left) / 3600000) * 100}%`;
}

async function ensureProfile() {
  if (!user) return;
  await sb.from("lp_profiles").upsert({
    id: user.id,
    handle: "reader-" + user.id.replace(/-/g, "").slice(0, 8),
    display_name: (user.email || "reader").split("@")[0],
  });
}

async function loadHour() {
  const { data: hour } = await sb.from("lp_hours").select("*").eq("hour_key", hourKey()).maybeSingle();
  if (!hour) {
    $("#hourKicker").textContent = "Waiting on the hour";
    $("#hourTitle").textContent = "Nothing featured yet. Leave a public piece.";
    $("#hourFeature").hidden = true;
    return;
  }
  $("#hourKicker").textContent = hour.kicker || "This hour";
  $("#hourNote").textContent = hour.note || "Chosen from the public wall.";
  if (!hour.piece_id) {
    $("#hourTitle").textContent = hour.note || "The room is quiet.";
    $("#hourFeature").hidden = true;
    return;
  }
  const { data: piece } = await sb.from("lp_pieces").select("*, lp_profiles(display_name, handle)").eq("id", hour.piece_id).maybeSingle();
  if (!piece) {
    $("#hourTitle").textContent = "The featured piece slipped away.";
    $("#hourFeature").hidden = true;
    return;
  }
  $("#hourTitle").textContent = piece.title;
  $("#hourMeta").textContent = (piece.lp_profiles?.display_name || piece.lp_profiles?.handle || "anonymous") +
    " · public";
  $("#hourBody").textContent = piece.body;
  $("#hourFeature").hidden = false;
}

async function loadWall() {
  const { data } = await sb.from("lp_pieces").select("*, lp_profiles(display_name, handle)").eq("is_public", true).order("created_at", { ascending: false }).limit(40);
  const wall = $("#wall");
  wall.innerHTML = "";
  (data || []).forEach((p, i) => {
    const el = document.createElement("article");
    el.className = "card";
    el.style.animationDelay = `${i * 60}ms`;
    el.innerHTML = `<h3></h3><p class="meta"></p><p></p>`;
    el.querySelector("h3").textContent = p.title;
    el.querySelector(".meta").textContent = p.lp_profiles?.display_name || p.lp_profiles?.handle || "";
    el.querySelector("p:last-child").textContent = p.body.slice(0, 220);
    wall.appendChild(el);
  });
  if (!data || !data.length) wall.innerHTML = "<p>The wall is empty. Be the first to mark a piece public.</p>";
}

async function loadMine() {
  if (!user) {
    $("#mine").innerHTML = "";
    return;
  }
  const { data } = await sb.from("lp_pieces").select("*").eq("author_id", user.id).order("created_at", { ascending: false });
  const box = $("#mine");
  box.innerHTML = "";
  (data || []).forEach((p) => {
    const row = document.createElement("div");
    row.className = "mine";
    row.innerHTML = `<div><strong></strong><div class="meta"></div></div><button class="ghost" type="button"></button>`;
    row.querySelector("strong").textContent = p.title;
    row.querySelector(".meta").textContent = p.is_public ? "public" : "private";
    const btn = row.querySelector("button");
    btn.textContent = p.is_public ? "Make private" : "Make public";
    btn.onclick = async () => {
      await sb.from("lp_pieces").update({ is_public: !p.is_public }).eq("id", p.id);
      await loadMine();
      await loadWall();
    };
    box.appendChild(row);
  });
}

function setSession(session) {
  user = session?.user || null;
  $("#authBtn").textContent = user ? "Sign out" : "Sign in";
  $("#deskBtn").style.opacity = user ? "1" : ".55";
}

document.querySelectorAll("[data-view]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const v = btn.getAttribute("data-view");
    if (v === "desk" && !user) return show("auth");
    show(v);
  });
});

$("#authBtn").addEventListener("click", async () => {
  if (user) {
    await sb.auth.signOut();
    setSession(null);
    show("home");
    return;
  }
  show("auth");
});

$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = fd.get("email");
  const password = fd.get("password");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  $("#authHint").textContent = error ? error.message : "Welcome back.";
  if (!error) {
    await ensureProfile();
    show("desk");
    loadMine();
  }
});

$("#signupBtn").addEventListener("click", async () => {
  const fd = new FormData($("#authForm"));
  const email = fd.get("email");
  const password = fd.get("password");
  const { error } = await sb.auth.signUp({ email, password });
  $("#authHint").textContent = error ? error.message : "Account created. If email confirmation is on, check your inbox, then sign in.";
  if (!error) await ensureProfile();
});

$("#pieceForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!user) return show("auth");
  await ensureProfile();
  const fd = new FormData(e.target);
  const { error } = await sb.from("lp_pieces").insert({
    author_id: user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: fd.get("is_public") === "on",
  });
  if (error) {
    alert(error.message);
    return;
  }
  e.target.reset();
  await loadMine();
  await loadWall();
});

sb.auth.onAuthStateChange((_e, session) => {
  setSession(session);
  if (session) {
    ensureProfile();
    loadMine();
  }
});

(async () => {
  const { data } = await sb.auth.getSession();
  setSession(data.session);
  tickClock();
  setInterval(tickClock, 1000);
  await loadHour();
  await loadWall();
  if (user) await loadMine();
})();
