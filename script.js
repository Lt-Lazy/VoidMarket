/* =========================
   VoidMarket – simple simulator (EN)
   =========================

   HOW TO ADD A NEW BOX NOW:
   1) Push a new object into DATA.boxes (id, name, price, design, rates, pool)
   2) If you have <div id="marketCards" class="cards"></div> in HTML, it will render automatically.
      If you keep the old hard-coded cards, normal/event keep working; new boxes will just require the marketCards container to show.
*/

/* ---------- Local session (index.html sets this) ---------- */
const USERS_KEY   = (typeof window !== "undefined" && window.USERS_KEY)   ? window.USERS_KEY   : "vm_users_v1";
const SESSION_KEY = (typeof window !== "undefined" && window.SESSION_KEY) ? window.SESSION_KEY : "vm_session_v1";

function deleteCurrentUser(){
  const sess = getSession?.();
  const uname = sess?.username;
  if(!uname) return;

  const ok = confirm(
    `Delete user "${uname}" and all local progress?\n\n` +
    "This removes this profile and its saved inventory, coins, and achievements from this browser."
  );
  if(!ok) return;

  // 1) Remove this user's save file
  try { localStorage.removeItem(userSaveKey(uname)); } catch {}

  // 2) Remove the user from the local users store
  const users = loadUsers();
  if (users && users[uname]) {
    delete users[uname];
    saveUsers(users);
  }

  // 3) Clear session and go back to login
  clearSession?.();
  window.location.href = "index.html";
}

function loadUsers(){
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
  catch { return {}; }
}
function saveUsers(obj){
  localStorage.setItem(USERS_KEY, JSON.stringify(obj || {}));
}

/* ---------- Per-user save helpers ---------- */
const SAVE_NS = "voidmarket_save_v2"; // base namespace you used before

function getActiveUsername() {
  const s = getSession?.();
  return s?.username || null;
}

/** Build a per-user storage key like: voidmarket_save_v2@alice */
function userSaveKey(username) {
  return `${SAVE_NS}@${username}`;
}

/** Optional: one-time migration from old global save to the first user who logs in */
function migrateGlobalSaveIfAny(username) {
  const old = localStorage.getItem(SAVE_NS);
  const destKey = userSaveKey(username);
  if (old && !localStorage.getItem(destKey)) {
    localStorage.setItem(destKey, old);
    // Keep the old global key in case you want to share; delete if you prefer:
    // localStorage.removeItem(SAVE_NS);
  }
}

function getSession(){
  try{ return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch{ return null; }
}
function requireSession(){
  const s = getSession();
  if(!s?.username){
    // no active session -> back to login
    window.location.href = "index.html";
    return null;
  }
  return s;
}
function clearSession(){
  try{ localStorage.removeItem(SESSION_KEY); }catch{}
}


const RARITY = {
  COMMON: "COMMON",
  RARE: "RARE",
  EPIC: "EPIC",
  LEGENDARY: "LEGENDARY",
  GLITCH: "GLITCH",
  MYTHIC: "MYTHIC",
};

const DATA = {
  boxes: [
    {
      id: "normal",
      name: "Standard Box",
      price: 0,
      design: "assets/boxes/boxNormal/box-normal.png",
      rates: { COMMON: 80, RARE: 10, EPIC: 6, LEGENDARY: 3, MYTHIC: 1 },
      pool: [
        { id: "nl-gr1", name: "Grodr",             rarity: RARITY.COMMON,    img: "assets/boxes/boxNormal/nl-gr1.png", description: "Sea life 01: Grodr, a fresh water fish. Likes to be around other same-species fish, sensitive, Not fond of Albino Grodr", value: 10 },
        { id: "nl-gr2", name: "Grouder",           rarity: RARITY.COMMON,    img: "assets/boxes/boxNormal/nl-gr2.png", description: "Sea life 02: Grouder, fresh water fish, big brother of grodr, in the same fish family. Hunts alone, protective", value: 15 },
        { id: "nl-kr1", name: "Krap",              rarity: RARITY.COMMON,    img: "assets/boxes/boxNormal/nl-kr1.png", description: "Sea life 03: Krap, salt water fish, more fond of high temperate waters (exotic), extravagant, swims slow", value: 30 },
        { id: "nl-al1", name: "Albino Grodr",      rarity: RARITY.RARE,      img: "assets/boxes/boxNormal/nl-al1.png", description: "Sea life 04: Albino Grodr, fresh water fish, branched and exiled from the Grodr fish because of their intimidating look, wouldnt hurt a fly...", value: 150 },
        { id: "nl-al2", name: "Albino Krap",       rarity: RARITY.EPIC,      img: "assets/boxes/boxNormal/nl-al2.png", description: "Sea life 05: Albino Krap, salt water fish, more fond of high temperate waters, Leaders of other Krap, swims fast, usually around others", value: 650 },
        { id: "nl-gw1", name: "Great White",       rarity: RARITY.LEGENDARY, img: "assets/boxes/boxNormal/nl-gw1.png", description: "Sea life 06: Great White, the king of the waters, hunts alone, not the top predator", value: 2300 },
        { id: "nl-egw", name: "Elder Great White", rarity: RARITY.MYTHIC,    img: "assets/boxes/boxNormal/nl-egw.png", description: "Sea life 07: Elder Great White, leader of the shark family, the top predator", value: 2300 },

      ]
    },
    {
      id: "event",
      name: "Beta Box",
      price: 200,
      design: "assets/boxes/beta/beta-box.png",
      rates: { COMMON: 50, RARE: 30, EPIC: 16, LEGENDARY: 3 , MYTHIC: 1 },
      pool: [
        { id: "bta-pos", name: "Poisetle",          rarity: RARITY.COMMON,    img: "assets/boxes/beta/bta-pos.png", description: "VoidQuest 01: Poisetle, found in green terrain, tamable", value: 40 },
        { id: "bta-sko", name: "Skuggosk",          rarity: RARITY.COMMON,    img: "assets/boxes/beta/bta-sko.png", description: "VoidQuest 02: Skuggosk, often near lakes, can be found in deep water caves, peak companion", value: 45 },
        { id: "bta-vlm", name: "VoidLore Merchant", rarity: RARITY.RARE,      img: "assets/boxes/beta/bta-vlm.png", description: "VoidQuest 03: VoidLore merchants can be found across VoidLore, color of hood indicates area of practice", value: 420 },
        { id: "bta-dvl", name: "Deep Void Lure",    rarity: RARITY.RARE,      img: "assets/boxes/beta/bta-dvl.png", description: "VoidQuest 04: Deep Void Lure, can only be fished or found in the deep lakes of a cave, not friendly to strangers", value: 480 },
        { id: "bta-bk1", name: "Blue Karp",         rarity: RARITY.EPIC,      img: "assets/boxes/beta/bta-bk1.png", description: "VoidQuest 05: Blue Karp, not many observations, in the Karp family, not seen with them", value: 847 },
        { id: "bta-noc", name: "Nocturne",          rarity: RARITY.EPIC,      img: "assets/boxes/beta/bta-noc.png", description: "VoidQuest 06: Nocturne, old wise man, legendary fisherman, known for catching a deep void lure and taming it as a pet", value: 761 },
        { id: "bta-asf", name: "Ashfin",            rarity: RARITY.LEGENDARY, img: "assets/boxes/beta/bta-asf.png", description: "VoidQuest 07: Nocturne, Not much data, look based on observations around boiling clXx..ERROR404n4n1 ", value: 12530 },
      ]
    },
    //  Add more boxes here (id, name, price, design, rates, pool)
  ]
};

// Helpers
const getBox     = (id) => DATA.boxes.find(b => b.id === id);
const ratesToStr = (r) => `${r.COMMON}% C / ${r.RARE}% R / ${r.EPIC}% E / ${r.LEGENDARY}% L /  ${r.MYTHIC}% M`;

// --- App State (localStorage) ---
let state = {
  coins: 0,
  inventory: {},
  achievements: {} // keep achievements per user too
};

function save() {
  const u = getActiveUsername();
  if (!u) return; // not logged in yet
  localStorage.setItem(userSaveKey(u), JSON.stringify(state));
}

function load() {
  const u = getActiveUsername();
  if (!u) return;
  migrateGlobalSaveIfAny(u);
  try {
    const raw = localStorage.getItem(userSaveKey(u));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state = { ...state, ...parsed };
      }
    }
  } catch (e) {
    console.warn("Load failed:", e);
  }
}

function fmt(num){ return new Intl.NumberFormat("en-US").format(num); }
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showToast(msg){
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(()=> el.classList.remove("show"), 1600);
}

function updateCoins(){ $("#coinCount").textContent = fmt(state.coins); }

// ---------- Inventory render ----------
function renderInventory(filter = "ALL"){
  const grid = $("#inventoryGrid");
  grid.innerHTML = "";
  const all = Object.values(state.inventory);
  const filtered = filter === "ALL" ? all : all.filter(x => x.rarity === filter);

  if(filtered.length === 0){
    $("#emptyInv").style.display = "block";
    return;
  } else {
    $("#emptyInv").style.display = "none";
  }

  for(const it of filtered){
    const card = document.createElement("div");
    card.className = "item";
    card.dataset.itemId = it.id;

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = it.rarity;
    card.appendChild(badge);

    const img = document.createElement("img");
    img.src = it.img;
    img.alt = it.name;
    img.onerror = () => { img.style.opacity = .6; img.alt = "Missing image"; };
    card.appendChild(img);

    const cap = document.createElement("div");
    cap.className = "cap";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = it.name;
    const count = document.createElement("div");
    count.className = "count";
    count.textContent = "x" + it.count;
    cap.appendChild(name);
    cap.appendChild(count);
    card.appendChild(cap);

    // click to open item modal
    card.addEventListener("click", () => openItemModal(it.id));

    grid.appendChild(card);
  }
}

function switchTab(to){
  $$(".tabpanel").forEach(el => el.classList.remove("active"));
  $$(".vm-tabs .tab").forEach(el => el.classList.remove("active"));
  document.getElementById(to).classList.add("active");
  $(`.vm-tabs .tab[data-tab="${to}"]`).classList.add("active");
  if(to === "inventory") renderInventory($("#rarityFilter").value);
  if(to === "achievements") renderAchievements();
}

/* ---------- Item Modal ---------- */
let currentModalId = null;

function openItemModal(itemId){
  const it = state.inventory[itemId];
  if(!it) return;

  currentModalId = itemId;
  $("#modalImg").src = it.img;
  $("#modalImg").alt = it.name;
  $("#modalName").textContent = it.name;
  $("#modalRarity").textContent = it.rarity;
  $("#modalRarity").setAttribute("data-rarity", it.rarity);
  $("#modalCount").textContent = "x" + it.count;
  $("#modalDesc").textContent = it.description || "No description.";
  $("#modalValue").textContent = fmt(it.value || 0);

  $("#itemModal").classList.remove("hidden");
}
function closeItemModal(){
  $("#itemModal").classList.add("hidden");
  currentModalId = null;
}

function sellOne(){
  if(!currentModalId) return;
  const it = state.inventory[currentModalId];
  if(!it || it.count <= 0) return;

  state.coins += (it.value || 0);
  it.count -= 1;
  if(it.count <= 0){
    delete state.inventory[currentModalId];
    closeItemModal();
  }else{
    $("#modalCount").textContent = "x" + it.count;
  }

  save();
  updateCoins();
  renderInventory($("#rarityFilter").value);
  evaluateAchievements();
  showToast("Sold 1 for +" + fmt(it.value || 0) + " Credit ");
}

/* ---------- Box opening & reveal (data-driven) ---------- */
function rollRarityFor(box){
  const roll = Math.random() * 100;
  let sum = 0;
  for(const [rar, p] of Object.entries(box.rates)){
    sum += p;
    if(roll <= sum) return rar;
  }
  return RARITY.COMMON;
}

function pickItem(pool, rarity){
  const candidates = pool.filter(x => x.rarity === rarity);
  if(candidates.length === 0){
    return pool[Math.floor(Math.random()*pool.length)];
  }
  return candidates[Math.floor(Math.random()*candidates.length)];
}

function showOpening(boxId){
  const box = getBox(boxId);
  const overlay = $("#openingOverlay");
  const img = $("#openingImg");
  img.src = box?.design || "";
  img.alt = box?.name || "Box";
  overlay.classList.remove("hidden");
}
function hideOpening(){ $("#openingOverlay").classList.add("hidden"); }

function showReveal(item){
  $("#revealImg").src = item.img;
  $("#revealImg").alt = item.name;
  $("#revealName").textContent = item.name;
  const tag = $("#revealTag");
  tag.textContent = item.rarity;
  tag.setAttribute("data-rarity", item.rarity);
  $("#revealArea").classList.remove("hidden");
}
function hideReveal(){ $("#revealArea").classList.add("hidden"); }

function openBox(boxId){
  const box = getBox(boxId);
  if(!box) return;

  if(state.coins < box.price){
    showToast("Not enough credit!");
    return;
  }
  state.coins -= box.price;
  updateCoins();

  showOpening(box.id);

  // compute result
  const rarity = rollRarityFor(box);
  const item = pickItem(box.pool, rarity);

  // Schedule reveal FIRST so a network error can’t block the UI
  setTimeout(() => {
    if(!state.inventory[item.id]){
      state.inventory[item.id] = { ...item, count: 1 };
    } else {
      state.inventory[item.id].count += 1;
    }
    save();
    renderInventory($("#rarityFilter").value);
    evaluateAchievements();

    hideOpening();
    showReveal(item);
  }, 1100);

  // Telemetry: fire-and-forget
  if (rarity === "EPIC" || rarity === "LEGENDARY") {
    // Guard in case the function is ever missing
    if (typeof sendCommunityEvent === "function") {
      sendCommunityEvent(rarity, item.id, box.id);
    }
  }
}


/* ---------- Market rendering ---------- */
function renderMarket(){
  const container = document.getElementById("marketCards");
  if(container){
    // Dynamic rendering for all boxes
    container.innerHTML = "";
    for(const box of DATA.boxes){
      const article = document.createElement("article");
      article.className = "card";

      const media = document.createElement("div");
      media.className = "card-media boxskin";
      media.style.backgroundImage = `url("${box.design}")`;

      const body = document.createElement("div");
      body.className = "card-body";
      body.innerHTML = `
        <h2>${box.name}</h2>
        <p>Contains 1 random collectible from the ${box.name.toLowerCase().replace(" box","")} pool.</p>
        <ul class="meta">
          <li>Price: <strong>${box.price}</strong> Credit</li>
          <li>Drop rates: ${ratesToStr(box.rates)}</li>
        </ul>`;

      const actions = document.createElement("div");
      actions.className = "card-actions";
      const btn = document.createElement("button");
      btn.className = "btn " + (box.id === "event" ? "accent" : "primary");
      btn.textContent = `Open ${box.name}`;
      btn.addEventListener("click", () => openBox(box.id));
      actions.appendChild(btn);

      article.appendChild(media);
      article.appendChild(body);
      article.appendChild(actions);
      container.appendChild(article);
    }
  } else {
    // Fallback for legacy hard-coded normal/event cards
    const normal = getBox("normal");
    const eventB = getBox("event");
    const priceNormalEl = document.getElementById("price-normal");
    const priceEventEl  = document.getElementById("price-event");
    const skinNormalEl  = document.getElementById("skin-normal");
    const skinEventEl   = document.getElementById("skin-event");

    if(priceNormalEl && normal) priceNormalEl.textContent = normal.price;
    if(priceEventEl && eventB)  priceEventEl.textContent  = eventB.price;
    if(skinNormalEl && normal)  skinNormalEl.style.backgroundImage = `url("${normal.design}")`;
    if(skinEventEl && eventB)   skinEventEl.style.backgroundImage  = `url("${eventB.design}")`;

    const openNormalBtn = document.getElementById("openNormal");
    const openEventBtn  = document.getElementById("openEvent");
    if(openNormalBtn) openNormalBtn.addEventListener("click", () => openBox("normal"));
    if(openEventBtn)  openEventBtn.addEventListener("click", () => openBox("event"));
  }
}


function firstRunBonuses(){
  if(Object.keys(state.inventory).length === 0 && state.coins === 0){
    // small starter bonus
    state.coins = 150;
    save();
  }
}

/* ---------- Bind & Mount ---------- */
function bindEvents(){
  // Tabs
  $$(".vm-tabs .tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Opening overlay click = no-op (prevents closing)
  $("#openingOverlay").addEventListener("click", (e) => e.stopPropagation());

  // Reveal modal
  $("#revealClose").addEventListener("click", hideReveal);
  $("#revealArea").addEventListener("click", (e) => {
    if(e.target.id === "revealArea") hideReveal();
  });

  // Inventory filter
  $("#rarityFilter").addEventListener("change", (e) => {
    renderInventory(e.target.value);
  });

  // Item modal
  $("#itemModalClose").addEventListener("click", closeItemModal);
  $("#itemModal").addEventListener("click", (e) => {
    if(e.target.id === "itemModal") closeItemModal();
  });
  $("#sellOneBtn").addEventListener("click", sellOne);

  // Profile dropdown
  const btn = document.getElementById("profileBtn");
  const menu = document.getElementById("profileMenu");
  if(btn && menu){
    btn.addEventListener("click", (e)=>{
      e.stopPropagation();
      const open = !menu.classList.contains("hidden");
      menu.classList.toggle("hidden", open);   // toggle
      btn.setAttribute("aria-expanded", String(!open));
    });
    document.addEventListener("click", () => {
      menu.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    });
    menu.addEventListener("click", (e)=> e.stopPropagation());
  }

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if(logoutBtn){
    logoutBtn.addEventListener("click", ()=>{
      clearSession();
      window.location.href = "index.html";
    });
  }

  const delBtn = document.getElementById("deleteUserBtn");
  if (delBtn) {
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteCurrentUser();
    });
  }


}

function mount(){
  const session = requireSession();   // <-- NEW (redirects to index.html if not logged in)
  if(!session) return;

  // fill profile UI
  const uname = session.username;
  const pn = document.getElementById("profileName");
  const pu = document.getElementById("profileUser");
  if(pn) pn.textContent = uname;
  if(pu) pu.textContent = uname;

  load();
  firstRunBonuses();
  renderMarket();
  updateCoins();
  renderInventory("ALL");
  renderAchievements?.();   // if you added achievements earlier
  evaluateAchievements?.(); // idem
  bindEvents();
}

/* ---------- Community rare-drop reporting ---------- */
const SUPABASE_URL = "https://kmvwakrearjltkocvoaq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imttdndha3JlYXJqbHRrb2N2b2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MjMyNTUsImV4cCI6MjA3ODE5OTI1NX0.2UHfcZpNu0DwJ7sgvQPJf3FuidYZb1iF5Sf7Di8Y0YM";

// Fire-and-forget rare/legendary ping to Supabase
async function sendCommunityEvent(rarity, itemId, boxId) {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await fetch(`${SUPABASE_URL}/rest/v1/rare_drops`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify([{ rarity, item_id: itemId, box_id: boxId, tz }])
    });
  } catch (e) {
    console.warn("Community ping failed", e);
    // Do nothing else; never block the game on telemetry
  }
}

async function fetchCommunityCounts() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rare_counts_24h?select=bucket,rarity,drops`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      }
    });
    if (!res.ok) {
      console.warn("community GET failed", res.status, await res.text());
      return [];
    }
    return await res.json(); // [{bucket, rarity, drops}, ...]
  } catch (e) {
    console.warn("community GET error", e);
    return [];
  }
}

async function drawCommunityChart() {
  const canvas = document.getElementById("communityChart");
  if (!canvas || typeof Chart === "undefined") return;

  const data = await fetchCommunityCounts();
  if (!Array.isArray(data)) return;

  const buckets = [...new Set(data.map(d => d.bucket))];
  const by = (r) => buckets.map(b =>
    data.find(d => String(d.bucket) === String(b) && d.rarity === r)?.drops || 0
  );

  // If there are zero labels, show a tiny placeholder so the canvas doesn't disappear
  const labels = buckets.length ? buckets : ["No data yet"];
  const epic = buckets.length ? by("EPIC") : [0];
  const leg  = buckets.length ? by("LEGENDARY") : [0];

  const chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "EPIC", data: epic, borderColor: "#6d28d9" },
        { label: "LEGENDARY", data: leg, borderColor: "#b45309" }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  setInterval(async () => {
    const fresh = await fetchCommunityCounts();
    const b2 = [...new Set(fresh.map(d => d.bucket))];
    const labels2 = b2.length ? b2 : ["No data yet"];
    const epic2 = b2.length ? b2.map(b => fresh.find(d => String(d.bucket) === String(b) && d.rarity === "EPIC")?.drops || 0) : [0];
    const leg2  = b2.length ? b2.map(b => fresh.find(d => String(d.bucket) === String(b) && d.rarity === "LEGENDARY")?.drops || 0) : [0];

    chart.data.labels = labels2;
    chart.data.datasets[0].data = epic2;
    chart.data.datasets[1].data = leg2;
    chart.update();
  }, 60000);
}

/* -------------------- Achievements -------------------- */
const ACHIEVEMENTS = [
  {
    id: "ach_fullset_standard",
    title: "Full Set: Standard",
    description: "Own all 7 items from the Standard Box at the same time.",
    icon: "assets/boxes/boxNormal/box-normal.png",
    check: (st) => {
      const normal = getBox("normal");
      if (!normal) return false;
      // must have at least one of each item from normal.pool
      return normal.pool.every(it => st.inventory[it.id]?.count > 0);
    }
  },
    {
    id: "ach_fullset_beta",
    title: "Full Set: Beta",
    description: "Own all 7 items from the Beta Box at the same time.",
    icon: "assets/boxes/beta/beta-box.png",
    check: (st) => {
      const beta = getBox("event");
      if (!beta) return false;
      // must have at least one of each item from normal.pool
      return beta.pool.every(it => st.inventory[it.id]?.count > 0);
    }
  },
  {
    id: "ach_first_common",
    title: "First Common!",
    description: "Obtain any Common item.",
    icon: "assets/achievements/achFirstCommon.png",
    check: (st) => Object.values(st.inventory).some(x => x.rarity === RARITY.COMMON)
  },
  {
    id: "ach_first_legendary",
    title: "First Legendary!",
    description: "Obtain any Legendary item.",
    icon: "assets/achievements/achFirstLegendary.png",
    check: (st) => Object.values(st.inventory).some(x => x.rarity === RARITY.LEGENDARY)
  },
  {
    id: "ach_1000_credits",
    title: "Around the block",
    description: "Reach 1 000 credits in your wallet.",
    icon: "assets/achievements/achFirst1kCredits.png",  
    check: (st) => st.coins >= 1000
  },
  {
    id: "ach_10000_credits",
    title: "Collector",
    description: "Reach 10 000 credits in your wallet.",
    icon: "assets/achievements/achFirst10kCredits.png",  
    check: (st) => st.coins >= 10000
  },
  {
    id: "ach_50000_credits",
    title: "Master Collector",
    description: "Reach 50 000 credits in your wallet.",
    icon: "assets/achievements/achFirst50kCredits.png",  
    check: (st) => st.coins >= 50000
  },
  {
    id: "ach_100000_credits",
    title: "Wealthy!",
    description: "Reach 100 000 credits in your wallet.",
    icon: "assets/achievements/achFirst100kCredits.png",  
    check: (st) => st.coins >= 100000
  },
];

function ensureAchievementState(){
  if(!state.achievements) state.achievements = {}; // id -> timestamp
}
function isAchUnlocked(id){ ensureAchievementState(); return !!state.achievements[id]; }
function unlockAchievement(id){
  ensureAchievementState();
  if (!state.achievements[id]) {
    state.achievements[id] = Date.now();
    save();
    const a = ACHIEVEMENTS.find(x => x.id === id);
    showToast(`Achievement unlocked: ${a?.title || id}`);
    renderAchievements();
  }
}
function evaluateAchievements(){
  ensureAchievementState();
  for(const a of ACHIEVEMENTS){
    if(!isAchUnlocked(a.id) && a.check(state)){
      unlockAchievement(a.id);
    }
  }
}

function renderAchievements() {
  const wrap = document.getElementById("achList");
  const counterEl = document.getElementById("achCounter");
  if (!wrap) return;

  wrap.innerHTML = "";

  let unlockedCount = 0;
  for (const a of ACHIEVEMENTS) {
    const unlocked = isAchUnlocked(a.id);
    if (unlocked) unlockedCount++;

    const el = document.createElement("div");
    el.className = "ach-item " + (unlocked ? "unlocked" : "locked");
    el.innerHTML = `
      <div class="ach-icon"><img src="${a.icon}" alt="${a.title}" class="ach-img" /></div>
      <div class="ach-body">
        <h4>${a.title}</h4>
        <p>${a.description}</p>
        <div class="ach-meta">
          ${unlocked ? ("Unlocked: " + new Date(state.achievements[a.id]).toLocaleString()) : "Locked"}
        </div>
      </div>
    `;
    wrap.appendChild(el);
  }

  // Update the counter text (e.g., 2/10)
  if (counterEl) {
    counterEl.textContent = `${unlockedCount}/${ACHIEVEMENTS.length}`;
  }
}

/* -------------------- Achievements END -------------------- */

document.addEventListener("DOMContentLoaded", () => {
  mount();
  drawCommunityChart();
});
