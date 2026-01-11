

/* ---------- Local session (index.html sets this) ---------- */
const USERS_KEY   = (typeof window !== "undefined" && window.USERS_KEY)   ? window.USERS_KEY   : "vm_users_v1";
const SESSION_KEY = (typeof window !== "undefined" && window.SESSION_KEY) ? window.SESSION_KEY : "vm_session_v1";

// ---------- Supabase client for game saves ----------
const VM_APP_SUPABASE_URL = "https://vsasxahjavdstcrcsghg.supabase.co";
const VM_APP_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzYXN4YWhqYXZkc3RjcmNzZ2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNDI4MzgsImV4cCI6MjA3ODgxODgzOH0.g3DF07JppjF19-7FT7wNk--Ns7wbC83jcC-eZtjoiGs";

let vmSupabase = null;
if (typeof window !== "undefined" && window.supabase) {
  vmSupabase = window.supabase.createClient(VM_APP_SUPABASE_URL, VM_APP_SUPABASE_ANON_KEY);
}

let profileMeta = null;

async function enforceLegalSession({ silent = false } = {}) {
  try {
    // 1) Auth session må finnes
    if (!vmSupabase) throw new Error("vmSupabase not initialized");

    const { data: authData, error: authErr } = await vmSupabase.auth.getUser();
    if (authErr || !authData?.user) {
      if (!silent) console.warn("No auth user:", authErr);
      throw new Error("No auth user");
    }

    const userId = authData.user.id;

    // 2) profiles må finnes og være approved
    const { data: prof, error: profErr } = await vmSupabase
      .from("profiles")
      .select("id, approved")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) {
      if (!silent) console.error("Profile fetch error:", profErr);
      // Hvis DB feiler midlertidig kan du velge å IKKE kaste ut.
      // Men siden du vil være streng: kast ut.
      throw new Error("Profile fetch failed");
    }

    if (!prof || prof.approved !== true) {
      throw new Error("Profile missing or not approved");
    }

    // Lovlig
    return { ok: true, userId };
  } catch (e) {
    // Ikke lovlig → logg ut og redirect
    try { await vmSupabase?.auth.signOut(); } catch {}
    try { localStorage.removeItem("vm_session_v1"); } catch {}
    location.replace("index.html");
    return { ok: false };
  }
}

// ---------- Global chat ----------
let globalChatChannel = null;
let globalChatBuffer = []; // siste meldinger i minnet

const GLOBAL_CHAT_POS_KEY = "vm_globalChatPos_v1";
const GLOBAL_CHAT_COLLAPSED_KEY = "vm_globalChatCollapsed_v1";

function isMobileLayout(){
  return window.matchMedia?.("(max-width: 720px)")?.matches ?? false;
}

function applyGlobalChatCollapsed(chat, collapsed){
  if (!chat) return;
  if (collapsed) chat.classList.add("collapsed");
  else chat.classList.remove("collapsed");
  try {
    localStorage.setItem(
      GLOBAL_CHAT_COLLAPSED_KEY,
      JSON.stringify(!!collapsed)
    );
  } catch {}
}

function restoreGlobalChatCollapsed(chat){
  try {
    const raw = localStorage.getItem(GLOBAL_CHAT_COLLAPSED_KEY);
    if (!raw) return;
    const collapsed = JSON.parse(raw);
    if (collapsed) chat.classList.add("collapsed");
  } catch {}
}

function restoreGlobalChatPosition(chat){
  if (!chat || isMobileLayout()) return;

  try {
    const raw = localStorage.getItem(GLOBAL_CHAT_POS_KEY);
    if (!raw) return;
    const pos = JSON.parse(raw);
    if (typeof pos.left === "number" && typeof pos.top === "number") {
      chat.style.left = pos.left + "px";
      chat.style.top  = pos.top  + "px";
      chat.style.bottom = "auto";
    }
  } catch {}
}

function saveGlobalChatPosition(chat){
  if (!chat || isMobileLayout()) return;

  const left = parseInt(chat.style.left, 10);
  const top  = parseInt(chat.style.top, 10);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return;

  try {
    localStorage.setItem(
      GLOBAL_CHAT_POS_KEY,
      JSON.stringify({ left, top })
    );
  } catch {}
}

function setupGlobalChatUI(){
  const chat   = document.getElementById("globalChat");
  const header = chat?.querySelector(".global-chat-header");
  const toggle = document.getElementById("globalChatToggle");
  if (!chat || !header) return;

  // start state
  restoreGlobalChatPosition(chat);
  restoreGlobalChatCollapsed(chat);

  // toggle/minimize (PC + mobil)
  if (toggle){
    toggle.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const collapsed = chat.classList.contains("collapsed");
      applyGlobalChatCollapsed(chat, !collapsed);
    });
  }

  // draggable på desktop
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener("mousedown", (e) => {
    if (isMobileLayout()) return;      // ikke draggable på mobil
    if (e.button !== 0) return;        // bare venstreklikk

    dragging = true;
    const rect = chat.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  function onMove(e){
    if (!dragging) return;

    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;

    const w = chat.offsetWidth;
    const h = chat.offsetHeight;
    const maxX = window.innerWidth  - w;
    const maxY = window.innerHeight - h;

    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > maxX) x = maxX;
    if (y > maxY) y = maxY;

    chat.style.left = x + "px";
    chat.style.top  = y + "px";
    chat.style.bottom = "auto";
  }

  function onUp(){
    if (!dragging) return;
    dragging = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    saveGlobalChatPosition(chat);
  }

  // hvis man endrer vindu-størrelse: sørg for at chatten ikke havner utenfor skjermen
  window.addEventListener("resize", () => {
    if (isMobileLayout()){
      // på mobil lar vi CSS styre posisjon
      chat.style.left = "";
      chat.style.top  = "";
      chat.style.bottom = "";
      return;
    }

    const rect = chat.getBoundingClientRect();
    let x = rect.left;
    let y = rect.top;
    const w = rect.width;
    const h = rect.height;
    const maxX = window.innerWidth  - w;
    const maxY = window.innerHeight - h;

    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > maxX) x = maxX;
    if (y > maxY) y = maxY;

    chat.style.left = x + "px";
    chat.style.top  = y + "px";
    chat.style.bottom = "auto";
    saveGlobalChatPosition(chat);
  });
}

async function fetchProfileMeta() {
  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) return;

  try {
    const { data, error } = await vmSupabase
      .from("profiles")
      .select("username, created_at, current_title_id")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Supabase profile load error:", error);
      return;
    }

    profileMeta = data || null;

    try {
      ensureTitleState?.();
      if (data.current_title_id && !state.currentTitleId) {
        state.currentTitleId = data.current_title_id;
      }
    } catch {}

    renderHeaderTitle?.();

  } catch (e) {
    console.error("Supabase profile exception:", e);
  }
}


const ITEM_TYPE = {
  COLLECTIBLE: "COLLECTIBLE",
  BOX: "BOX"
};

function deleteCurrentUser(){
  const sess = getSession?.();
  const uname  = sess?.username;
  const userId = sess?.userId;

  if (!uname || !userId) {
    alert("Could not find your current session. Please log in again.");
    return;
  }

  // Første steg: forklar hvordan sletting fungerer
  const ok = confirm(
    "If you want to delete your user data, you need to send a deletion request to the VoidMarket team.\n\n" +
    "Press OK to open your email client with a pre-filled deletion request, or Cancel to go back."
  );

  if (!ok) return;

  // Bygg en dummy-epost til VoidMarket-teamet
  const subject = encodeURIComponent("VoidMarket deletion request");
  const body = encodeURIComponent(
    "Hi VoidMarket team,\n\n" +
    "I would like to request deletion of my VoidMarket account and associated user data.\n\n" +
    `Username: ${uname}\n` +
    `User ID: ${userId}\n` +
    "\nPlease delete my user data and saves associated with this account.\n\n" +
    "Best regards,\n" +
    uname
  );

  const mailto = `mailto:voidcrypt@hotmail.com?subject=${subject}&body=${body}`;

  // Åpner standard e-postklient med ferdig utfylt mail
  window.location.href = mailto;
}


function getSession(){
  try{ return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch{ return null; }
}
function requireSession(){
  const s = getSession();
  if(!s?.username){
    // no active session -> back to login
    location.replace("index.html");
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
      featuredColor: "#38bdf8",
      pool: [
        { id: "nl-gr1", name: "Grodr",             rarity: RARITY.COMMON,    img: "assets/boxes/boxNormal/nl-gr1.png", description: "Sea life 01: Grodr, a fresh water fish. Likes to be around other same-species fish, sensitive, Not fond of Albino Grodr", value: 10 },
        { id: "nl-gr2", name: "Grouder",           rarity: RARITY.COMMON,    img: "assets/boxes/boxNormal/nl-gr2.png", description: "Sea life 02: Grouder, fresh water fish, big brother of grodr, in the same fish family. Hunts alone, protective", value: 15 },
        { id: "nl-kr1", name: "Krap",              rarity: RARITY.COMMON,    img: "assets/boxes/boxNormal/nl-kr1.png", description: "Sea life 03: Krap, salt water fish, more fond of high temperate waters (exotic), extravagant, swims slow", value: 30 },
        { id: "nl-al1", name: "Albino Grodr",      rarity: RARITY.RARE,      img: "assets/boxes/boxNormal/nl-al1.png", description: "Sea life 04: Albino Grodr, fresh water fish, branched and exiled from the Grodr fish because of their intimidating look, wouldnt hurt a fly...", value: 150 },
        { id: "nl-al2", name: "Albino Krap",       rarity: RARITY.EPIC,      img: "assets/boxes/boxNormal/nl-al2.png", description: "Sea life 05: Albino Krap, salt water fish, more fond of high temperate waters, Leaders of other Krap, swims fast, usually around others", value: 650 },
        { id: "nl-gw1", name: "Great White",       rarity: RARITY.LEGENDARY, img: "assets/boxes/boxNormal/nl-gw1.png", description: "Sea life 06: Great White, the king of the waters, hunts alone, not the top predator", value: 2300 },
        { id: "nl-egw", name: "Elder Great White", rarity: RARITY.MYTHIC,    img: "assets/boxes/boxNormal/nl-egw.png", description: "Sea life 07: Elder Great White, leader of the shark family, the top predator", value: 68000 },

      ]
    },
    {
      id: "beta",
      name: "Beta Box",
      price: 200,
      design: "assets/boxes/beta/beta-box.png",
      rates: { COMMON: 50, RARE: 30, EPIC: 17, LEGENDARY: 3 , MYTHIC: 0 },
      featuredColor: "#facc15",
      pool: [
        { id: "bta-pos", name: "Poisetle",          rarity: RARITY.COMMON,    img: "assets/boxes/beta/bta-pos.png", description: "VoidQuest 01: Poisetle, found in green terrain, tamable", value: 40 },
        { id: "bta-sko", name: "Skuggosk",          rarity: RARITY.COMMON,    img: "assets/boxes/beta/bta-sko.png", description: "VoidQuest 02: Skuggosk, often near lakes, can be found in deep water caves, peak companion", value: 45 },
        { id: "bta-vlm", name: "VoidLore Merchant", rarity: RARITY.RARE,      img: "assets/boxes/beta/bta-vlm.png", description: "VoidQuest 03: VoidLore merchants can be found across VoidLore, color of hood indicates area of practice", value: 420 },
        { id: "bta-dvl", name: "Deep Void Lure",    rarity: RARITY.RARE,      img: "assets/boxes/beta/bta-dvl.png", description: "VoidQuest 04: Deep Void Lure, can only be fished or found in the deep lakes of a cave, not friendly to strangers", value: 480 },
        { id: "bta-bk1", name: "Blue Karp",         rarity: RARITY.EPIC,      img: "assets/boxes/beta/bta-bk1.png", description: "VoidQuest 05: Blue Karp, not many observations, in the Karp family, not seen with them", value: 847 },
        { id: "bta-noc", name: "Nocturne",          rarity: RARITY.EPIC,      img: "assets/boxes/beta/bta-noc.png", description: "VoidQuest 06: Nocturne, old wise man, legendary fisherman, known for catching a deep void lure and taming it as a pet", value: 761 },
        { id: "bta-asf", name: "Ashfin",            rarity: RARITY.LEGENDARY, img: "assets/boxes/beta/bta-asf.png", description: "VoidQuest 07: Ashfin, Not much data, look based on observations around boiling clXx..ERROR404n4n1 ", value: 12530 },
      ]
    },
    {
      id: "HW25",
      name: "Halloween 25 Box",
      price: 800,
      design: "assets/boxes/Halloween/hw25/HW2025.png",
      rates: { COMMON: 60, RARE: 20, EPIC: 18, LEGENDARY: 2, MYTHIC: 0 },
      featuredColor: "#a855f7",
      pool: [
        { id: "hw25-sc1", name: "Scream",           rarity: RARITY.COMMON,    img: "assets/boxes/Halloween/hw25/hw25-sc1.png", description: "Halloween25 01: Scream Card, First item in the Halloween 2025 event box. Fun world!", value: 70 },
        { id: "hw25-gh1", name: "Ghost",            rarity: RARITY.COMMON,    img: "assets/boxes/Halloween/hw25/hw25-gh1.png", description: "Halloween25 02: Ghost, as scared of you as you are of them, have a little spirit!", value: 81 },
        { id: "hw25-crw", name: "Scare Crow",       rarity: RARITY.RARE,      img: "assets/boxes/Halloween/hw25/hw25-crw.png", description: "Halloween25 03: Scrare Crow, At first hand just a tool to protect crops, unless it moves..", value: 651 },
        { id: "hw25-grs", name: "Grave Stone",      rarity: RARITY.EPIC,      img: "assets/boxes/Halloween/hw25/hw25-grs.png", description: "Halloween25 04: Scrare Crow, At first hand just a tool to protect crops, unless it moves..", value: 3800 },
        { id: "hw25-cul", name: "Suspicious Brew",  rarity: RARITY.LEGENDARY, img: "assets/boxes/Halloween/hw25/hw25-cul.png", description: "Halloween25 05: Suspicious Brew, around 12 ingredients, deep void lure is one of them...", value: 93000 },
        { id: "hw25-hau", name: "Haunted Painting", rarity: RARITY.LEGENDARY, img: "assets/boxes/Halloween/hw25/hw25-hau.png", description: "Halloween25 06: Haunted Painting, Seems a bit too late at night to have the lights on, dont you think?", value: 431000 },
      ]
    },

    {
      id: "XMAS25",
      name: "Xmas 25 Box",
      price: 800,
      design: "assets/boxes/Xmas/xmas25/xmas2025.png",
      rates: { COMMON: 63, RARE: 20, EPIC: 15, LEGENDARY: 2, MYTHIC: 0 },
      featuredColor: "#ff0000ff",
      pool: [
        { id: "xmas25-cc1", name: "Candy Cane",     rarity: RARITY.COMMON,    img: "assets/boxes/Xmas/xmas25/xm25-cc1.png",   description: "Xmas25 01: Candy Cane Card, First item in the Xmas 2025 event box. No screaming in church!", value: 86 },
        { id: "xmas25-sm2", name: "Snow Man",       rarity: RARITY.COMMON,    img: "assets/boxes/Xmas/xmas25/xm25-sm2.png",   description: "Xmas25 02: Snow Man, The christmas spirit follows along with the snow man", value: 692 },
        { id: "xmas25-ch3", name: "xmas hat",       rarity: RARITY.RARE,      img: "assets/boxes/Xmas/xmas25/xm25-ch3.png",   description: "Xmas25 03: Xmas hat, used by many or used by one merry man", value: 875 },
        { id: "xmas25-ct4", name: "xmas tree",      rarity: RARITY.EPIC,      img: "assets/boxes/Xmas/xmas25/xm25-ct4.png",   description: "Xmas25 04: Xmas tree, Found in the woods naked, renovated and placed in a home", value: 6850 },
        { id: "xmas25-sl5", name: "Santas list",    rarity: RARITY.EPIC,      img: "assets/boxes/Xmas/xmas25/xm25-sl5.png",   description: "Xmas25 05: Santas list, good or bad, your name will be on this list", value: 8200 },
        { id: "xmas25-sa6", name: "Saint Nicholas", rarity: RARITY.LEGENDARY, img: "assets/boxes/Xmas/xmas25/xm25-sa6.png",   description: "Xmas25 06: Saint Nicholas, is it a bird? Is it a plane?", value: 386000 },

      ]
    },

    {
      id: "fisherman25n",
      name: "Fisherman 25 box",
      price: 750,
      design: "assets/boxes/Series/fisherman25N/fm25n-box.png",
      rates: { COMMON: 70, RARE: 20, EPIC: 7, LEGENDARY: 3, MYTHIC: 0 },
      pool: [
        { id: "fm25n-adc",  name: "Abandoned Dock", rarity: RARITY.COMMON,    img: "assets/boxes/Series/fisherman25N/fm25n-adc.png",   description: "Fisherman25 01: An abandoned dock, used to fish for many years", value: 7 },
        { id: "fm25n-vi2",  name: "Viking Ship",    rarity: RARITY.COMMON,    img: "assets/boxes/Series/fisherman25N/fm25n-vi2.png",   description: "Fisherman25 02: Viking Ship, Crossing the big sea hoping for land to plunder", value: 37 },
        { id: "fm25n-sj1",  name: "Fishing Sjark",  rarity: RARITY.RARE,      img: "assets/boxes/Series/fisherman25N/fm25n-sj1.png",   description: "Fisherman25 03: Sjark, Humble fishing sjark trying to make a name for itself", value: 401 },
        { id: "fm25n-sm4",  name: "Sea Monster",    rarity: RARITY.EPIC,      img: "assets/boxes/Series/fisherman25N/fm25n-sm4.png",   description: "Fisherman25 04: Sea Monster, observations from survivors say this beast is much bigger under the surface", value: 835 },
        { id: "fm25n-sm5",  name: "Dead Crew",      rarity: RARITY.LEGENDARY, img: "assets/boxes/Series/fisherman25N/fm25n-sm5.png",   description: "Fisherman25 05: Dead Crew, the plunder group did in fact not find a land to plunder", value: 120000 },
      ]
    },

    /*
    {
      id: "goldenDays25",
      name: "Golden days Box",
      price: 650,
      design: "assets/boxes/knife/goldenDays25/gd25-box.png",
      rates: { COMMON: 50, RARE: 30, EPIC: 16, LEGENDARY: 3 , MYTHIC: 1 },
      pool: [

      
        { id: "gd25-gbk7", name: "Golden butterfly knife",   rarity: RARITY.LEGENDARY,    img: "assets/boxes/knife/goldenDays25/gd25-gbk7.png", description: "Golden days 07: This one of a kind butterfly knife marks the participation of the golden days of voidmarket", value: 130000 },

      ]
    },*/
    
  ]
};

// Helpers
const getBox     = (id) => DATA.boxes.find(b => b.id === id);
const ratesToStr = (r) => `${r.COMMON}% C / ${r.RARE}% R / ${r.EPIC}% E / ${r.LEGENDARY}% L /  ${r.MYTHIC}% M`;

// --- App State (localStorage) ---
let state = {
  coins: 0,
  inventory: {},
  achievements: {},
  featuredSlots: [null, null, null],
};

// ---------- Next box drop config ----------
//Endre datoen + navnet når det planlegges en ny box.
const NEXT_BOX_RELEASE = {
  active: true,
  at: "2026-02-01T20:30:00+01:00",
  name: "Golden days",
  
  //URL til bilde av boxen
  image: "assets/boxes/knife/goldenDays25/gd25-box.png"
};

// Hvilken box skal vises som "Featured" øverst i Market?
// Endre id-en her ("HW25", "beta", "normal", osv.)
const FEATURED_BOX_ID = "XMAS25";

// ---------- Player Shop (market_listings) ----------

const PLAYER_SHOP_MAX_LISTINGS = 5;

// Teller hvor mange aktive listings denne spilleren har
async function fetchMyActiveListingsCount(){
  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) return 0;

  try {
    const { count, error } = await vmSupabase
      .from("market_listings")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", userId)
      .eq("status", "active");

    if (error) {
      console.error("fetchMyActiveListingsCount error:", error);
      return 0;
    }
    return count || 0;
  } catch (e) {
    console.error("fetchMyActiveListingsCount exception:", e);
    return 0;
  }
}

// Leser alle aktive listings og render dem i Market → Player Shop
async function loadPlayerShopListings(){
  const listEl      = document.getElementById("playerShopList");
  const emptyEl     = document.getElementById("playerShopEmpty");
  const mineEl      = document.getElementById("playerShopMine");
  const mineEmptyEl = document.getElementById("playerShopMineEmpty");
  const myLabel     = document.getElementById("playerShopMyListingsLabel");

  if (!listEl || !vmSupabase) return;

  listEl.innerHTML = "";
  if (emptyEl)     emptyEl.style.display = "none";
  if (mineEl)      mineEl.innerHTML = "";
  if (mineEmptyEl) mineEmptyEl.style.display = "none";

  const session = getSession?.();
  const userId  = session?.userId;

  try {
    const { data, error } = await vmSupabase
      .from("market_listings")
      .select("id, seller_id, seller_username, item_id, item, price, status, buyer_id, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("loadPlayerShopListings error:", error);
      listEl.innerHTML = `<p class="muted small">Could not load listings.</p>`;
      return;
    }

    const rows  = data || [];
    const mine  = userId ? rows.filter(r => r.seller_id === userId) : [];
    const other = userId ? rows.filter(r => r.seller_id !== userId) : rows;

    // ---- Global liste (alle spillere) ----
    if (!other.length){
      listEl.style.display = "none";
      if (emptyEl) emptyEl.style.display = "block";
    } else {
      listEl.style.display = "grid";
      for (const row of other){
        const it   = row.item || {};
        const rowEl = document.createElement("div");
        rowEl.className = "player-shop-row";

        const main = document.createElement("div");
        main.className = "player-shop-main";

        const img = document.createElement("img");
        img.src = it.img || "";
        img.alt = it.name || "Item";
        img.onerror = () => { img.style.opacity = 0.6; img.alt = "Missing image"; };

        const meta = document.createElement("div");
        meta.className = "player-shop-meta";

        const nameEl = document.createElement("div");
        nameEl.className = "player-shop-name";
        nameEl.textContent = it.name || "Unknown item";

        const sellerEl = document.createElement("div");
        sellerEl.className = "player-shop-seller";
        sellerEl.textContent = `Seller: ${row.seller_username || "unknown"}`;

        meta.appendChild(nameEl);
        meta.appendChild(sellerEl);
        main.appendChild(img);
        main.appendChild(meta);

        const right = document.createElement("div");
        right.className = "player-shop-actions";

        const priceEl = document.createElement("div");
        priceEl.className = "player-shop-price";
        priceEl.textContent = `${fmt(row.price || 0)} Credit`;
        right.appendChild(priceEl);

        const buyBtn = document.createElement("button");
        buyBtn.className = "btn tiny";
        buyBtn.type = "button";
        buyBtn.textContent = "Buy";
        buyBtn.addEventListener("click", () => buyListing(row.id));
        right.appendChild(buyBtn);

        rowEl.appendChild(main);
        rowEl.appendChild(right);
        listEl.appendChild(rowEl);
      }
    }

    // ---- My listings (kun denne spilleren) ----
    if (mineEl){
      if (!mine.length){
        mineEl.style.display = "none";
        if (mineEmptyEl) mineEmptyEl.style.display = "block";
      } else {
        mineEl.style.display = "grid";
        for (const row of mine){
          const it    = row.item || {};
          const rowEl = document.createElement("div");
          rowEl.className = "player-shop-row";

          const main = document.createElement("div");
          main.className = "player-shop-main";

          const img = document.createElement("img");
          img.src = it.img || "";
          img.alt = it.name || "Item";
          img.onerror = () => { img.style.opacity = 0.6; img.alt = "Missing image"; };

          const meta = document.createElement("div");
          meta.className = "player-shop-meta";

          const nameEl = document.createElement("div");
          nameEl.className = "player-shop-name";
          nameEl.textContent = it.name || "Unknown item";

          // VISE SELGERNAVN + at det er din listing
          const sellerEl = document.createElement("div");
          sellerEl.className = "player-shop-seller";
          sellerEl.textContent = `Seller: ${row.seller_username || "you"} (your listing)`;

          meta.appendChild(nameEl);
          meta.appendChild(sellerEl);
          main.appendChild(img);
          main.appendChild(meta);

          const right = document.createElement("div");
          right.className = "player-shop-actions";

          // Pris til høyre – samme som i hovedlisten
          const priceEl = document.createElement("div");
          priceEl.className = "player-shop-price";
          priceEl.textContent = `${fmt(row.price || 0)} Credit`;
          right.appendChild(priceEl);

          const cancelBtn = document.createElement("button");
          cancelBtn.className = "btn tiny";
          cancelBtn.type = "button";
          cancelBtn.textContent = "Cancel";
          cancelBtn.addEventListener("click", () => cancelListing(row.id));
          right.appendChild(cancelBtn);

          rowEl.appendChild(main);
          rowEl.appendChild(right);
          mineEl.appendChild(rowEl);
        }
      }
    }

    // Oppdater "Your active listings: x/5"
    if (myLabel) {
      const myCount = mine.length;
      myLabel.textContent = `Your active listings: ${myCount}/${PLAYER_SHOP_MAX_LISTINGS}`;
    }
  } catch (e) {
    console.error("loadPlayerShopListings exception:", e);
    listEl.innerHTML = `<p class="muted small">Could not load listings.</p>`;
  }
}


// Kalles fra item-modal: legg ut 1 stk av currentModalId til salgs (SERVER-AUTH)
async function listCurrentItemOnPlayerShop(){
  if (!currentModalId) return;

  const it = state.inventory[currentModalId];
  if (!it || it.count <= 0) {
    showToast("No items left to list.");
    return;
  }

  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) {
    showToast("Online features are not available.");
    return;
  }

  try {
    // UX-sjekk: listing-limit (DB håndhever også i RPC, men dette gir rask melding)
    const currentCount = await fetchMyActiveListingsCount();
    if (currentCount >= PLAYER_SHOP_MAX_LISTINGS) {
      showToast("You already have 5 active listings.");
      return;
    }

    // Pris-prompt
    const suggested = it.value || 0;
    const defaultStr = suggested > 0 ? String(suggested) : "";
    const priceStr = prompt(`Set price (Credits) for 1x ${it.name}:`, defaultStr);
    if (priceStr === null) return;

    const price = parseInt(priceStr, 10);
    if (!Number.isFinite(price) || price <= 0) {
      showToast("Invalid price.");
      return;
    }

    // ✅ DB gjør: trekk 1 item fra inventory + opprett listing
    const { data, error } = await vmSupabase.rpc("vm_market_list", {
      p_item_id: currentModalId,
      p_price: price
    });

    if (error) {
      console.error("vm_market_list error:", error);
      showToast(error.message || "Could not create listing.");
      return;
    }

    // ✅ Oppdater inventory fra DB (sannheten)
    if (data?.inventory) state.inventory = data.inventory;

    // Oppdater modal count / lukk modal hvis itemet ble 0
    const itNow = state.inventory[currentModalId];
    if (!itNow) {
      closeItemModal();
    } else {
      const cntEl = document.getElementById("modalCount");
      if (cntEl) cntEl.textContent = "x" + (itNow.count || 0);
    }

    // Re-render inventory + listings
    renderInventory(getInventoryFilter(), getInventorySearch());
    showToast("Listing created!");
    await loadPlayerShopListings();

  } catch (e) {
    console.error("listCurrentItemOnPlayerShop exception:", e);
    showToast("Unexpected error when creating listing.");
  }
}


async function buyListing(listingId){
  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) return;

  try {
    const { data, error } = await vmSupabase.rpc("vm_market_buy", {
      p_listing_id: String(listingId)
    });

    if (error) {
      console.error("vm_market_buy error:", error);
      showToast(error.message || "Could not complete purchase.");
      await loadPlayerShopListings();
      return;
    }

    // DB er autoriteten: ta imot oppdatert coins/inventory
    if (typeof data?.coins === "number") state.coins = data.coins;
    if (data?.inventory) state.inventory = data.inventory;

    updateCoins();
    renderInventory(getInventoryFilter(), getInventorySearch());
    showToast("Item purchased!");

    await loadPlayerShopListings();
  } catch (e) {
    console.error("buyListing exception:", e);
    showToast("Unexpected error when buying listing.");
  }
}


async function cancelListing(listingId){
  const session = getSession?.();
  const userId  = session?.userId;
  if (!vmSupabase || !userId) return;

  if (!confirm("Cancel this listing and return the item to your inventory?")) return;

  try {
    const { data, error } = await vmSupabase.rpc("vm_market_cancel", {
      p_listing_id: String(listingId)
    });

    if (error) {
      console.error("vm_market_cancel error:", error);
      showToast(error.message || "Could not cancel listing.");
      await loadPlayerShopListings();
      return;
    }

    if (data?.inventory) state.inventory = data.inventory;

    renderInventory(getInventoryFilter(), getInventorySearch());
    showToast("Listing cancelled.");
    await loadPlayerShopListings();
  } catch (e) {
    console.error("cancelListing exception:", e);
    showToast("Unexpected error when cancelling listing.");
  }
}




// ---------- Trading state ----------
let currentTradeFriend = null;       // { id, username }
let currentTradeOffer = {};          // { itemId: count }

// Hjelp: vis / skjul trade-modal
function showTradeModal(){
  const el = document.getElementById("tradeModal");
  if (el) el.classList.remove("hidden");
}
function hideTradeModal(){
  const el = document.getElementById("tradeModal");
  if (el) el.classList.add("hidden");
  currentTradeFriend = null;
  currentTradeOffer = {};
  const err = document.getElementById("tradeError");
  if (err) err.textContent = "";
}

// ---------- GLOBAL CHAT ----------

function appendGlobalChatMessage(msg, scroll = true){
  const list = document.getElementById("globalChatList");
  if (!list || !msg) return;

  globalChatBuffer.push(msg);
  if (globalChatBuffer.length > 50) globalChatBuffer.shift();

  const li = document.createElement("li");
  li.className = "global-chat-message";

  const t = new Date(msg.created_at || Date.now());
  const timeSpan = document.createElement("span");
  timeSpan.className = "global-chat-time";
  timeSpan.textContent = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const textSpan = document.createElement("span");
  textSpan.innerHTML = formatGlobalChatText(msg.text);

  li.appendChild(timeSpan);
  li.appendChild(textSpan);
  list.appendChild(li);

  if (scroll) {
    list.scrollTop = list.scrollHeight;
  }
}

function renderGlobalChat(messages){
  const list = document.getElementById("globalChatList");
  if (!list) return;
  list.innerHTML = "";
  globalChatBuffer = [];
  for (const m of messages) {
    appendGlobalChatMessage(m, false);
  }
  list.scrollTop = list.scrollHeight;
}

async function initGlobalChat(){
  // alltid sett opp UI (drag + toggle), selv om Supabase ikke finnes
  setupGlobalChatUI();

  if (!vmSupabase) return;

  // 1) hent siste meldinger ved oppstart
  try {
    const { data, error } = await vmSupabase
      .from("global_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      renderGlobalChat(data.reverse());
    } else if (error) {
      console.error("initGlobalChat load error:", error);
    }
  } catch (e) {
    console.error("initGlobalChat exception:", e);
  }

  // 2) Realtime subscription for INSERTS
  try {
    globalChatChannel = vmSupabase
      .channel("global_messages_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_messages" },
        (payload) => {
          // payload.new er raden som ble inserta
          appendGlobalChatMessage(payload.new, true);
        }
      )
      .subscribe((status) => {
        console.log("global chat channel status:", status);
      });
  } catch (e) {
    console.error("global chat subscribe error:", e);
  }
}


function postUnboxGlobalMessage(username, rarity, item){
  if (!vmSupabase || !item) return;
  const rarityLabel = rarity.toLowerCase(); // "legendary"/"mythic"
  const text = `${username} unboxed a ${rarityLabel} ${item.name}!`;

  vmSupabase
    .from("global_messages")
    .insert({
      type: "unbox",
      username,
      text,
    })
    .then(() => {})
    .catch((e) => {
      console.error("global chat insert error:", e);
    });
}

function formatGlobalChatText(text){
  if (!text) return "";

  // sjekk for legendary / mythic (case insensitive)
  const patterns = [
    { key: "legendary", rarity: "LEGENDARY" },
    { key: "mythic", rarity: "MYTHIC" }
  ];

  let out = text;

  for (const p of patterns){
    const regex = new RegExp(`\\b${p.key}\\b`, "i"); // matcher bare ordet
    if (regex.test(out)){
      out = out.replace(
        regex,
        `<span class="pill" data-rarity="${p.rarity}">${p.key}</span>`
      );
    }
  }

  return out;
}


// ---------- GLOBAL CHAT END ----------

async function save() {
  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) return;

  try {
    // 🔒 SAFE payload: IKKE coins, IKKE inventory
    const payload = {
      achievements: state.achievements,
      titles: state.titles,
      current_title_id: state.currentTitleId || null,
      featured_slots: ensureFeaturedSlots()
    };

    const { error } = await vmSupabase
      .from("saves")
      .update(payload)
      .eq("user_id", userId);

    if (error) console.error("Supabase save error:", error);
  } catch (e) {
    console.error("Supabase save exception:", e);
  }
}

async function load() {
  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) {
    // Ingen Supabase tilgjengelig → vi gjør ingenting
    return;
  }

  try {
    const { data, error } = await vmSupabase
      .from("saves")
      .select("coins, inventory, achievements, titles, current_title_id, featured_slots")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Supabase load error:", error);
      return;
    }

    if (data) {
      state.coins = data.coins ?? 0;
      state.inventory = data.inventory || {};
      state.achievements = data.achievements || {};
      state.titles = data.titles || {};
      state.currentTitleId = data.current_title_id || null;
      state.featuredSlots = Array.isArray(data.featured_slots)
        ? data.featured_slots
        : [null, null, null];

      ensureTitleState();
    }
  } catch (e) {
    console.error("Supabase load exception:", e);
  }
}

setInterval(() => {
  enforceLegalSession({ silent: true });
}, 30000); // hvert 30. sekund


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
function renderInventory(filter = "ALL", search = ""){
  const grid = $("#inventoryGrid");
  grid.innerHTML = "";

  const all = Object.values(state.inventory);

  // Først: rarity-filter
  let filtered = (filter === "ALL")
    ? all
    : all.filter(x => x.rarity === filter);

  // Så: tekst-søk på name + description
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(x => {
      const name = (x.name || "").toLowerCase();
      const desc = (x.description || "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }

  if (filtered.length === 0){
    const emptyEl = $("#emptyInv");
    if (emptyEl) {
      if (all.length === 0) {
        // Ingen items i det hele tatt
        emptyEl.textContent = "No items yet – open a box in the Market!";
      } else {
        // Du har items, men ingenting matchet filter/søk
        emptyEl.textContent = "No items match your filter/search.";
      }
      emptyEl.style.display = "block";
    }
    return;
  } else {
    $("#emptyInv").style.display = "none";
  }

  for (const it of filtered){
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
function getInventoryFilter(){
  const el = $("#rarityFilter");
  return el ? el.value : "ALL";
}
function getInventorySearch(){
  const el = $("#invSearch");
  return el ? el.value : "";
}

function switchTab(to){
  // hide any open overlays when navigating
  hideOpening();
  hideReveal();

  $$(".tabpanel").forEach(el => el.classList.remove("active"));
  $$(".vm-tabs .tab").forEach(el => el.classList.remove("active"));
  document.getElementById(to).classList.add("active");
  $(`.vm-tabs .tab[data-tab="${to}"]`).classList.add("active");

  if (to === "inventory") renderInventory(getInventoryFilter(), getInventorySearch());
  if (to === "trading")  loadTrades?.();
  if (to === "market")   loadPlayerShopListings();
  if (to === "profile") {
    renderProfile?.();
    loadSocial?.();
  }

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

  // Badge: use its rarity or "BOX"
  $("#modalRarity").textContent = it.rarity || (it.type === ITEM_TYPE.BOX ? "BOX" : "");
  $("#modalRarity").setAttribute("data-rarity", it.rarity || "COMMON");

  $("#modalCount").textContent = "x" + it.count;
  $("#modalDesc").textContent = it.description || (it.type === ITEM_TYPE.BOX ? "Unopened box." : "No description.");
  $("#modalValue").textContent = fmt(it.value || 0);

  // Toggle actions
  const openBtn = document.getElementById("openBoxBtn");
  if (openBtn) openBtn.style.display = (it.type === ITEM_TYPE.BOX) ? "inline-block" : "none";

  // (valgfritt) skjul slider for bokser, vis for collectibles
  const inspectSlider = document.getElementById("inspectSlider");
  if (inspectSlider) {
    inspectSlider.style.display = (it.type === ITEM_TYPE.BOX) ? "none" : "block";
  }

  // start alltid fra “midt lys/rotasjon”
  resetInspectTransform();

  $("#itemModal").classList.remove("hidden");
}


function closeItemModal(){
  $("#itemModal").classList.add("hidden");
  currentModalId = null;

  // valgfritt, men nice for neste gang
  resetInspectTransform();
}



function closeItemModal(){
  $("#itemModal").classList.add("hidden");
  currentModalId = null;
  resetInspectTransform();   // sørg for at neste item starter fra midten
}

/* ---------- Item inspect (fake 3D) ---------- */

function updateInspectTransform(rawValue){
  const img = document.getElementById("modalImg");
  if (!img) return;

  // Slider-verdi 0–100 -> -1 til 1
  const value = typeof rawValue === "number" ? rawValue : parseFloat(rawValue) || 50;
  const normalized = (value - 50) / 50; // -1 (venstre) til 1 (høyre)

  const maxAngle = 200;      // maks rotasjon i grader
  const maxSkew  = 6;       // liten ekstra "warp"
  const maxShift = 16;      // hvor mye den glir sideveis

  const angle = normalized * maxAngle;
  const skewY = -normalized * maxSkew;
  const tx    = normalized * maxShift;

  img.style.transform =
    `perspective(900px) rotateY(${angle}deg) skewY(${skewY}deg) translateX(${tx}px)`;
}

function resetInspectTransform(){
  const slider = document.getElementById("inspectSlider");
  if (slider) slider.value = 50;
  updateInspectTransform(50);
}


async function sellOne(){
  if (!currentModalId) return;

  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) return;

  try {
    const { data, error } = await vmSupabase.rpc("vm_sell_one", {
      p_item_id: currentModalId
    });

    if (error) {
      console.error("vm_sell_one error:", error);
      showToast(error.message || "Could not sell item.");
      return;
    }

    // DB er autoriteten
    if (typeof data?.coins === "number") state.coins = data.coins;
    if (data?.inventory) state.inventory = data.inventory;

    // Oppdater modal UI
    const itNow = state.inventory[currentModalId];
    if (!itNow) {
      closeItemModal();
    } else {
      const cntEl = document.getElementById("modalCount");
      if (cntEl) cntEl.textContent = "x" + (itNow.count || 0);
    }

    updateCoins();
    renderInventory(getInventoryFilter(), getInventorySearch());
    evaluateAchievements?.();

    showToast("Sold 1 for +" + fmt(data?.sold_for || 0) + " Credit");
  } catch (e) {
    console.error("sellOne exception:", e);
    showToast("Unexpected error when selling.");
  }
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
    renderInventory(getInventoryFilter(), getInventorySearch());
    evaluateAchievements();

    hideOpening();
    showReveal(item);

    const usernameForChat =
      profileMeta?.username || getSession()?.username || "Someone";

    if (rarity === RARITY.LEGENDARY || rarity === RARITY.MYTHIC) {
      postUnboxGlobalMessage(usernameForChat, rarity, item);
    }

  }, 1100);

}


/* ---------- Market rendering ---------- */
function renderMarket(){
  const container = document.getElementById("marketCards");
  const featuredWrap = document.getElementById("marketFeatured");

  // --- FEATURED BOX ---
  if (featuredWrap) {
    featuredWrap.innerHTML = "";

    const featuredBox =
      DATA.boxes.find(b => b.id === FEATURED_BOX_ID) || DATA.boxes[0];

    if (featuredBox) {
      const article = document.createElement("article");
      article.className = "card market-featured-card";

      // Her setter vi fargen på featured box vinduet
      if (featuredBox.featuredColor){
        article.style.setProperty("--featured-color", featuredBox.featuredColor);
      }

      article.innerHTML = `
        <div class="market-featured-banner">// FEATURED BOX</div>
        <div class="market-featured-main">
          <div class="market-featured-art">
            <div
              class="card-media boxskin"
              style="background-image: url('${featuredBox.design}')"
            ></div>
          </div>
          <div class="market-featured-info">
            <h2>${featuredBox.name}</h2>
            <p>Spotlight box in the current VoidMarket rotation.</p>
            <ul class="meta">
              <li>Price: <strong>${featuredBox.price}</strong> Credit</li>
              <li>Drop rates: ${ratesToStr(featuredBox.rates)}</li>
            </ul>
            <div class="card-actions">
              <button class="btn accent" type="button" id="featuredBuyBtn">
                Buy ${featuredBox.name}
              </button>
            </div>
          </div>
        </div>
      `;

      const buyBtn = article.querySelector("#featuredBuyBtn");
      if (buyBtn) {
        buyBtn.addEventListener("click", () => purchaseBox(featuredBox.id));
      }

      featuredWrap.appendChild(article);
    }
  }

  // --- Vanlige box-kort under ---
  if (container){
    container.innerHTML = "";
    for (const box of DATA.boxes){
      // Ikke dupliser featured box i lista hvis du ikke vil
      if (box.id === FEATURED_BOX_ID) continue;

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
      btn.className = "btn primary";
      btn.textContent = `Buy ${box.name}`;
      btn.addEventListener("click", () => purchaseBox(box.id));
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
    if(openNormalBtn) openNormalBtn.addEventListener("click", () => purchaseBox("normal"));
    if(openEventBtn)  openEventBtn.addEventListener("click", () => purchaseBox("event"));
  }
}

// Countdown next drop function
let nextBoxCountdownTimer = null;

function initNextBoxCountdown(){
  const el = document.getElementById("nextBoxCountdown");
  const nameEl = document.getElementById("nextBoxName");
  if (!el) return;

  // Hvis det ikke har planlagt noe drop
  if (!NEXT_BOX_RELEASE || !NEXT_BOX_RELEASE.active) {
    el.textContent = "No scheduled drop";
    if (nameEl) nameEl.textContent = "";
    return;
  }

  if (nameEl && NEXT_BOX_RELEASE.name) {
    nameEl.textContent = NEXT_BOX_RELEASE.name;
  }

  const imgEl = document.getElementById("nextBoxImage");
  if (imgEl && NEXT_BOX_RELEASE.image) {
      imgEl.src = NEXT_BOX_RELEASE.image;
  }

  const target = new Date(NEXT_BOX_RELEASE.at);

  function update(){
    const now = new Date();
    const diff = target - now;

    if (diff <= 0){
      el.textContent = "Available now";
      if (nameEl && NEXT_BOX_RELEASE.name) {
        nameEl.textContent = NEXT_BOX_RELEASE.name;
      }
      if (nextBoxCountdownTimer) {
        clearInterval(nextBoxCountdownTimer);
        nextBoxCountdownTimer = null;
      }
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days    = Math.floor(totalSeconds / (24 * 3600));
    const hours   = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n) => String(n).padStart(2, "0");
    el.textContent = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  update();
  nextBoxCountdownTimer = setInterval(update, 1000);
}


// Turn a DATA.boxes[] entry into an inventory record
function makeBoxInventoryEntry(box){
  return {
    id: `box:${box.id}`,           // inventory key for this box type
    name: box.name,
    rarity: "BOX",                 // purely a label for UI badge
    img: box.design,               // show your box art
    description: "Unopened box. Open to reveal a collectible from this set.",
    value: Math.round(box.price * 0.8), // resale value (tweak as you like)
    type: ITEM_TYPE.BOX,
    boxId: box.id,                 // needed to know which pool to roll from
  };
}

// Buy a box (SERVER-AUTH): DB trekker coins + legger box i inventory
async function purchaseBox(boxId){
  const box = getBox(boxId);
  if(!box) return;

  // UX-sjekk (ikke sikkerhet): for å gi rask melding i UI
  if(state.coins < box.price){
    showToast("Not enough credits!");
    return;
  }

  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) {
    showToast("Not logged in.");
    return;
  }

  try {
    // ✅ DB gjør sjekk + oppdatering
    const { data, error } = await vmSupabase.rpc("vm_purchase_box", {
      p_box_id: boxId
    });

    if (error) {
      console.error("vm_purchase_box error:", error);
      showToast(error.message || "Could not buy box.");
      return;
    }

    // ✅ DB returnerer oppdatert coins + inventory
    state.coins = data.coins ?? state.coins;
    state.inventory = data.inventory ?? state.inventory;

    updateCoins();
    renderInventory(getInventoryFilter(), getInventorySearch());
    showToast(`${box.name} added to inventory.`);
  } catch (e) {
    console.error("vm_purchase_box exception:", e);
    showToast("Unexpected error.");
  }
}


async function openBoxFromInventory(itemId){
  const it = state.inventory[itemId];
  if(!it || it.type !== ITEM_TYPE.BOX) return;

  const box = getBox(it.boxId);
  if(!box) return;

  // Vis åpne-animasjon med en gang
  showOpening(box.id);

  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) {
    hideOpening();
    showToast("Not logged in.");
    return;
  }

  try {
    // ✅ DB gjør: sjekk box finnes, trekk 1 box, rull item, legg item i inventory
    const { data, error } = await vmSupabase.rpc("vm_open_box", {
      p_box_id: it.boxId
    });

    if (error) {
      console.error("vm_open_box error:", error);
      hideOpening();
      showToast(error.message || "Could not open box.");
      return;
    }

    // data forventes å være:
    // { inventory: {...}, rolled_item: {...}, rarity: "COMMON" | ... }
    const rolledItem = data?.rolled_item;
    const rolledRarity = data?.rarity;

    // Vent litt så UX matcher animasjonen (som før)
    setTimeout(() => {
      // ✅ Oppdater state fra DB (sannheten)
      if (data?.inventory) state.inventory = data.inventory;

      renderInventory(getInventoryFilter(), getInventorySearch());
      hideOpening();

      if (rolledItem) {
        showReveal(rolledItem);

        const usernameForChat =
          profileMeta?.username || getSession()?.username || "Someone";

        if (rolledRarity === RARITY.LEGENDARY || rolledRarity === RARITY.MYTHIC) {
          postUnboxGlobalMessage(usernameForChat, rolledRarity, rolledItem);
        }
      } else {
        showToast("Opened, but no item returned.");
      }

      evaluateAchievements?.();
    }, 1100);

  } catch (e) {
    console.error("vm_open_box exception:", e);
    hideOpening();
    showToast("Unexpected error.");
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
    renderInventory(e.target.value, getInventorySearch());
  });

  // Inventory search
  const invSearch = $("#invSearch");
  if (invSearch) {
    invSearch.addEventListener("input", () => {
      renderInventory(getInventoryFilter(), invSearch.value);
    });
  }

  // Item modal
  $("#itemModalClose").addEventListener("click", closeItemModal);
  $("#itemModal").addEventListener("click", (e) => {
    if(e.target.id === "itemModal") closeItemModal();
  });
  $("#sellOneBtn").addEventListener("click", sellOne);

  const playerSellBtn = document.getElementById("playerSellBtn");
  if (playerSellBtn) {
    playerSellBtn.addEventListener("click", () => {
      listCurrentItemOnPlayerShop();
    });
  }

  const psRefresh = document.getElementById("playerShopRefreshBtn");
  if (psRefresh) {
    psRefresh.addEventListener("click", () => {
      loadPlayerShopListings();
    });
  }

  // Inspect-slider (depth light + warp)
  const inspectSlider = document.getElementById("inspectSlider");
  if (inspectSlider) {
    inspectSlider.addEventListener("input", (e) => {
      updateInspectTransform(e.target.value);
    });
  }

  // Profile button 
  const profileBtn = document.getElementById("profileBtn");
  if (profileBtn) {
    profileBtn.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab("profile");
    });
  }

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if(logoutBtn){
    logoutBtn.addEventListener("click", ()=>{
      clearSession();
      location.replace("index.html");
    });
  }

  const delBtn = document.getElementById("deleteUserBtn");
  if (delBtn) {
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteCurrentUser();
    });
  }

  // Discord button → opens invite in new tab
  const discordBtn = document.getElementById("discordBtn");
  if (discordBtn) {
    discordBtn.addEventListener("click", () => {
      window.open("https://discord.gg/MJDUbEBWuc", "_blank");
    });
  }

  const openBoxBtn = document.getElementById("openBoxBtn");
  if (openBoxBtn) {
    openBoxBtn.addEventListener("click", () => {
      if (!currentModalId) return;
      openBoxFromInventory(currentModalId);
      // Close the modal; the reveal will show after animation
      closeItemModal();
    });
  }

  // Profile featured slot buttons in item modal
  $$(".profile-slot-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const slot = parseInt(btn.dataset.slot, 10);
      if (Number.isNaN(slot)) return;
      setFeaturedFromModal(slot);
    });
  });

  // Social / friends
  const addFriendBtn = document.getElementById("addFriendBtn");
  const friendInput  = document.getElementById("friendSearchInput");
  const viewProfileBtn = document.getElementById("viewProfileBtn");

  if (addFriendBtn && friendInput) {
    addFriendBtn.addEventListener("click", () => {
      addFriendByName(friendInput.value);
    });

    friendInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addFriendByName(friendInput.value);
      }
    });
  }

  if (viewProfileBtn && friendInput) {
    viewProfileBtn.addEventListener("click", () => {
      openPublicProfileByName(friendInput.value);
    });
  }

  const openTradingTabBtn = document.getElementById("openTradingTabBtn");
  if (openTradingTabBtn) {
    openTradingTabBtn.addEventListener("click", () => {
      switchTab("trading");
    });
  }

  // Trade modal buttons
  const tradeSendBtn   = document.getElementById("tradeSendBtn");
  const tradeCancelBtn = document.getElementById("tradeCancelBtn");
  const tradeCloseBtn  = document.getElementById("tradeModalClose");

  if (tradeSendBtn) {
    tradeSendBtn.addEventListener("click", submitTrade);
  }
  if (tradeCancelBtn) {
    tradeCancelBtn.addEventListener("click", hideTradeModal);
  }
  if (tradeCloseBtn) {
    tradeCloseBtn.addEventListener("click", hideTradeModal);
  }

  // Public profile modal
  const publicProfileModal = document.getElementById("publicProfileModal");
  const publicProfileClose = document.getElementById("publicProfileClose");

  if (publicProfileClose) {
    publicProfileClose.addEventListener("click", () => {
      closePublicProfileModal();
    });
  }

  if (publicProfileModal) {
    publicProfileModal.addEventListener("click", (e) => {
      if (e.target.id === "publicProfileModal") {
        closePublicProfileModal();
      }
    });
  }

  // Progress view toggle (Achievements / Titles)
  $$(".ach-view-btn[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      const achView = document.getElementById("achievementsView");
      const titleView = document.getElementById("titlesView");

      $$(".ach-view-btn[data-view]").forEach(b => {
        b.classList.toggle("active", b === btn);
      });

      if (view === "titles") {
        if (achView) achView.hidden = true;
        if (titleView) titleView.hidden = false;
      } else {
        if (achView) achView.hidden = false;
        if (titleView) titleView.hidden = true;
      }
    });
  });

  // Title select / clear buttons
  const titleSelect = document.getElementById("titleSelect");
  const clearTitleBtn = document.getElementById("clearTitleBtn");

  if (titleSelect) {
    titleSelect.addEventListener("change", () => {
      setCurrentTitle(titleSelect.value || null);
    });
  }

  if (clearTitleBtn) {
    clearTitleBtn.addEventListener("click", () => {
      setCurrentTitle(null);
      if (titleSelect) titleSelect.value = "";
    });
  }

}

async function mount(){
  const session = requireSession();
  if(!session) return;

  const uname = session.username;
  const pn = document.getElementById("profileName");
  const pu = document.getElementById("profileUser");
  if(pn) pn.textContent = uname;
  if(pu) pu.textContent = uname;

  (async function boot(){
    await enforceLegalSession(); // 🔥 dette kaster ut hvis user ikke finnes / ikke approved
    await init(); // resten av spillet
  })();


  // 1) Last save-data
  await load();

  // 2) Hent profil-metadata (created_at)
  await fetchProfileMeta();

  // 3) Last Player Shop listings
  await loadPlayerShopListings();

  // 4) Resten av oppstarten
  firstRunBonuses();
  renderMarket();
  initNextBoxCountdown();
  updateCoins();
  renderInventory("ALL");
  renderAchievements?.();
  evaluateAchievements?.();
  renderTitles?.();
  evaluateTitles?.();
  renderHeaderTitle?.();
  renderProfile?.();
  loadSocial?.();
  loadTrades?.();
  initGlobalChat?.();
  bindEvents();
}

function ensureFeaturedSlots(){
  if (!Array.isArray(state.featuredSlots)) {
    state.featuredSlots = [null, null, null];
  }
  return state.featuredSlots;
}

function setFeaturedFromModal(slotIndex){
  ensureFeaturedSlots();
  if (!currentModalId) return;

  const item = state.inventory[currentModalId];
  if (!item) return;

  state.featuredSlots[slotIndex] = currentModalId;
  save();
  showToast(`Set to profile slot ${slotIndex + 1}`);
  renderProfile?.();
}

/* -------------------- Achievements -------------------- */
const ACHIEVEMENTS = [
  { /* ------------- FULL SETS -------------- */
    id: "ach_fullset_standard",
    title: "Full Set: Standard",
    description: "Own all items from the Standard Box at the same time.",
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
    description: "Own all items from the Beta Box at the same time.",
    icon: "assets/boxes/beta/beta-box.png",
    check: (st) => {
      const beta = getBox("beta");
      if (!beta) return false;
      // must have at least one of each item from normal.pool
      return beta.pool.every(it => st.inventory[it.id]?.count > 0);
    }
  },
  {
    id: "ach_fullset_hw25",
    title: "Full Set: hw25",
    description: "Own all items from the Halloween 25 set at the same time.",
    icon: "assets/boxes/Halloween/hw25/HW2025.png",
    check: (st) => {
      const HW25 = getBox("HW25");
      if (!HW25) return false;
      // must have at least one of each item from normal.pool
      return HW25.pool.every(it => st.inventory[it.id]?.count > 0);
    }
  },
  
  {
    id: "ach_fullset_xmas25",
    title: "Full Set: xmas25",
    description: "Own all items from the Xmas 25 set at the same time.",
    icon: "assets/boxes/Xmas/xmas25/xmas2025.png",
    check: (st) => {
      const XMAS25 = getBox("XMAS25");
      if (!XMAS25) return false;
      // must have at least one of each item from normal.pool
      return XMAS25.pool.every(it => st.inventory[it.id]?.count > 0);
    }
  },

  {
    id: "ach_fullset_fm25n",
    title: "Full Set: Fisherman 25",
    description: "Own all items from the Fisherman 25 set set at the same time.",
    icon: "assets/boxes/Series/fisherman25N/fm25n-box.png",
    check: (st) => {
      const fm25n = getBox("fisherman25n");
      if (!fm25n) return false;
      // must have at least one of each item from normal.pool
      return fm25n.pool.every(it => st.inventory[it.id]?.count > 0);
    }
  },

  { /* ------------- RARITY -------------- */
    id: "ach_first_common",
    title: "First Common!",
    description: "Obtain any Common item.",
    icon: "assets/achievements/achFirstCommon.png",
    check: (st) => Object.values(st.inventory).some(x => x.rarity === RARITY.COMMON)
  },
  {
    id: "ach_first_legendary",
    title: "Gold Gold Gold",
    description: "Obtain any Legendary item.",
    icon: "assets/achievements/achFirstLegendary.png",
    check: (st) => Object.values(st.inventory).some(x => x.rarity === RARITY.LEGENDARY)
  },
  {
    id: "ach_legendary_fourth",
    title: "Fourth!",
    description: "Own four or more Legendary items at the same time.",
    icon: "assets/achievements/achFourthLegendary.png",
    check: (st) => Object.values(st.inventory)
        .filter(x => x.rarity === "LEGENDARY").length >= 4
  },
  { /* ------------- CREDITS -------------- */
    id: "ach_1000_credits",
    title: "Around the block",
    description: "Reach 1 000 credits in your wallet.",
    icon: "assets/achievements/achFirst1kCredits.png",  
    check: (st) => st.coins >= 1000
  },
  {
    id: "ach_10000_credits",
    title: "Pocket change",
    description: "Reach 10 000 credits in your wallet.",
    icon: "assets/achievements/achFirst10kCredits.png",  
    check: (st) => st.coins >= 10000
  },
  {
    id: "ach_50000_credits",
    title: "Business",
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
  { /* ------------- BOXES -------------- */
    id: "ach_first_box",
    title: "First Box!",
    description: "Purchase and open your first box.",
    icon: "assets/boxes/common-box.png",
    check: (st) => Object.values(st.inventory).some(x => x.type === "COLLECTIBLE")
  },
  {
    id: "ach_box_hoarder10",
    title: "Box Hoarder",
    description: "Have 10 or more unopened boxes in your inventory.",
    icon: "assets/achievements/achBoxHoarder10.png",
    check: (st) => Object.values(st.inventory)
        .filter(x => x.type === "BOX")
        .reduce((a,b)=>a+b.count,0) >= 10
  },
  {
    id: "ach_box_hoarder100",
    title: "Box Collector!",
    description: "Have 100 or more unopened boxes in your inventory.",
    icon: "assets/achievements/achBoxHoarder100.png",
    check: (st) => Object.values(st.inventory)
        .filter(x => x.type === "BOX")
        .reduce((a,b)=>a+b.count,0) >= 100
  },
  {
    id: "ach_box_hoarder1000",
    title: "Boxes!!",
    description: "Have 1000 or more unopened boxes in your inventory.",
    icon: "assets/achievements/achBoxHoarder1000.png",
    check: (st) => Object.values(st.inventory)
        .filter(x => x.type === "BOX")
        .reduce((a,b)=>a+b.count,0) >= 1000
  },
  { /* ------------- ITEMS -------------- */
    id: "ach_25_items",
    title: "Collector apprentice",
    description: "Own 25 items total in your inventory.",
    icon: "assets/achievements/ach25Items.png",
    check: (st) => Object.values(st.inventory).reduce((a,b)=>a+(b.count||0),0) >= 25
  },
  { 
    id: "ach_50_items",
    title: "Collector exam",
    description: "Own 50 items total in your inventory.",
    icon: "assets/achievements/ach50Items.png",
    check: (st) => Object.values(st.inventory).reduce((a,b)=>a+(b.count||0),0) >= 50
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
    evaluateTitles(); 
  }
}
function evaluateAchievements(){
  ensureAchievementState();
  for(const a of ACHIEVEMENTS){
    if(!isAchUnlocked(a.id) && a.check(state)){
      unlockAchievement(a.id);
    }
  }
  evaluateTitles(); 
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

/* -------------------- Titles -------------------- */

const TITLES = [
  {
    id: "title_fresh_collector",
    name: "Fresh Collector",
    description: "You joined VoidMarket.",
    rarity: "COMMON",
    // alltid tilgjengelig
    check: (st) => true
  },
  {
    id: "title_box_hoarder",
    name: "Box Hoarder",
    description: "For collectors who keep boxes sealed.",
    rarity: "RARE",
    requiresAchievements: ["ach_box_hoarder10"]
  },
  {
    id: "title_standard_archivist",
    name: "Standard Archivist",
    description: "Completed the Standard Box set.",
    rarity: "RARE",
    requiresAchievements: ["ach_fullset_standard"]
  },
  {
    id: "title_gold_seeker",
    name: "Gold Seeker",
    description: "Obtained at least one Legendary item.",
    rarity: "RARE",
    requiresAchievements: ["ach_first_legendary"]
  },
  {
    id: "title_wealthy",
    name: "Wealthy",
    description: "Reached 100 000 credits in your wallet.",
    rarity: "LEGENDARY",
    requiresAchievements: ["ach_100000_credits"]
  },
  {
    id: "title_xmas25",
    name: "Santa's Helper",
    description: "Completed the xmas 25 set",
    rarity: "EPIC",
    requiresAchievements: ["ach_fullset_xmas25"]
  },
  {
    id: "title_captain",
    name: "Captain",
    description: "Completed the Fisherman 25 set",
    rarity: "LEGENDARY",
    requiresAchievements: ["ach_fullset_fm25n"]
  },
];

function getTitleLabelById(id) {
  if (!id) return "No title equipped";
  const t = TITLES.find(x => x.id === id);
  return t ? t.name : id;
}

function renderTitles(){
  ensureTitleState();
  const listEl = document.getElementById("titleList");
  const counterEl = document.getElementById("titleCounter");
  if (!listEl) return;

  const unlocked = state.titles || {};
  const unlockedIds = Object.keys(unlocked);
  const unlockedSet = new Set(unlockedIds);

  const html = TITLES.map(t => {
    const isUnlocked = unlockedSet.has(t.id);
    const cls = [
      "title-item",
      isUnlocked ? "unlocked" : "locked",
      t.rarity ? ("title-" + t.rarity.toLowerCase()) : ""
    ].join(" ");

    const unlockText = isUnlocked
      ? "Unlocked: " + new Date(unlocked[t.id]).toLocaleString()
      : (t.hint || "Unlock this title by progressing in VoidMarket.");

    return `
      <article class="${cls}">
        <div class="title-main">
          <h4>${t.name}</h4>
          <p>${t.description || ""}</p>
        </div>
        <div class="title-meta">${unlockText}</div>
      </article>
    `;
  }).join("");

  listEl.innerHTML = html;

  if (counterEl) {
    counterEl.textContent = `${unlockedIds.length}/${TITLES.length}`;
  }

  populateTitleSelect();
}

function populateTitleSelect(){
  ensureTitleState();
  const select = document.getElementById("titleSelect");
  const label  = document.getElementById("currentTitleLabel");
  if (!select) return;

  const unlocked = state.titles || {};
  const unlockedSet = new Set(Object.keys(unlocked));

  select.innerHTML = "";

  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "No title";
  select.appendChild(optNone);

  for (const t of TITLES) {
    if (!unlockedSet.has(t.id)) continue;
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  }

  select.value = state.currentTitleId || "";

  if (label) {
    if (state.currentTitleId) {
      const t = TITLES.find(x => x.id === state.currentTitleId);
      label.textContent = t ? t.name : state.currentTitleId;
    } else {
      label.textContent = "No title equipped";
    }
  }

  renderHeaderTitle?.();
}

function renderHeaderTitle(){
  ensureTitleState();
  const chip = document.getElementById("profileTitleChip");
  if (!chip) return;

  if (state.currentTitleId) {
    const t = TITLES.find(x => x.id === state.currentTitleId);
    chip.textContent = t ? t.name : state.currentTitleId;
    chip.style.display = "";
  } else {
    chip.textContent = "";
    chip.style.display = "none";
  }
}

function ensureTitleState(){
  if (!state.titles) state.titles = {};        // id -> timestamp
  if (typeof state.currentTitleId === "undefined") {
    state.currentTitleId = null;
  }
}

function isTitleUnlocked(id){
  ensureTitleState();
  return !!state.titles[id];
}

function unlockTitle(id){
  ensureTitleState();
  if (state.titles[id]) return;

  state.titles[id] = Date.now();
  save();
  const t = TITLES.find(x => x.id === id);
  showToast?.(`New title unlocked: ${t?.name || id}`);
  renderTitles?.();
  renderProfile?.();
  renderHeaderTitle?.();
}

function evaluateTitles(){
  ensureAchievementState?.();
  ensureTitleState();
  const st = state;

  for (const t of TITLES) {
    if (isTitleUnlocked(t.id)) continue;

    let ok = false;

    if (Array.isArray(t.requiresAchievements) && t.requiresAchievements.length) {
      ok = t.requiresAchievements.every(aid => isAchUnlocked(aid));
    }

    if (!ok && typeof t.check === "function") {
      ok = !!t.check(st);
    }

    if (ok) {
      unlockTitle(t.id);
    }
  }

  renderTitles?.();
}

async function setCurrentTitle(id){
  ensureTitleState();
  if (id && !isTitleUnlocked(id)) {
    console.warn("Tried to equip locked title:", id);
    return;
  }

  state.currentTitleId = id || null;
  save();
  renderHeaderTitle();
  renderProfile?.();
  populateTitleSelect();

  const session = getSession?.();
  const userId = session?.userId;
  if (vmSupabase && userId) {
    try {
      await vmSupabase
        .from("profiles")
        .update({ current_title_id: state.currentTitleId })
        .eq("id", userId);
    } catch (e) {
      console.error("Profile title update error:", e);
    }
  }
}

/* -------------------- PROFIL -------------------- */



function renderProfile() {
  const s = getSession?.();
  const uname = s?.username || "Guest";

  // Username
  const userEl = document.getElementById("profileUsername");
  if (userEl) userEl.textContent = uname;

  // Created date (fra Supabase-profiler)
  let createdText = "Unknown";
  if (profileMeta?.created_at) {
    createdText = new Date(profileMeta.created_at).toLocaleString();
  }
  const createdEl = document.getElementById("profileCreatedAt");
  if (createdEl) createdEl.textContent = createdText;


  // Coins
  const coinsEl = document.getElementById("profileCoins");
  if (coinsEl) coinsEl.textContent = fmt(state.coins);

  // Inventory stats
  const inv = Object.values(state.inventory || {});
  const totalItems = inv.reduce((sum, it) => sum + (it.count || 0), 0);
  const boxesTotal = inv
    .filter(it => it.type === ITEM_TYPE.BOX)
    .reduce((sum, it) => sum + (it.count || 0), 0);
  const collTotal = inv
    .filter(it => it.type !== ITEM_TYPE.BOX)
    .reduce((sum, it) => sum + (it.count || 0), 0);

  const itemsEl = document.getElementById("profileItemsTotal");
  if (itemsEl) itemsEl.textContent = totalItems;

  const boxesEl = document.getElementById("profileBoxesTotal");
  if (boxesEl) boxesEl.textContent = boxesTotal;

  const collEl = document.getElementById("profileCollectiblesTotal");
  if (collEl) collEl.textContent = collTotal;

  // Achievements count
  let achCount = 0;
  try {
    ensureAchievementState?.();
    achCount = state.achievements ? Object.keys(state.achievements).length : 0;
  } catch {}
  const achEl = document.getElementById("profileAchCount");
  if (achEl) achEl.textContent = `${achCount}/${ACHIEVEMENTS.length}`;

  // Featured slots
  const slots = ensureFeaturedSlots();
  for (let i = 0; i < 3; i++) {
    const slotId = slots[i];
    const container = document.getElementById(`profileSlot${i + 1}`);
    if (!container) continue;

    const item = slotId ? state.inventory[slotId] : null;

    if (!item) {
      container.innerHTML = `
        <div class="profile-feature-empty">
          Empty slot<br><span> Slot ${i + 1}</span>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="profile-feature-slot-inner">
          <img src="${item.img}" alt="${item.name}">
          <div class="profile-feature-name">${item.name}</div>
          <div class="muted" style="font-size:12px;">x${item.count || 1} • ${item.rarity}</div>
        </div>
      `;
    }
  }
}


/* -------------------- PROFIL END -------------------- */

/* -------------------- SOCIAL / FRIENDS -------------------- */

async function fetchFriends() {
  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) return [];

  try {
    // 1) hent friend-rader for deg
    const { data: rows, error } = await vmSupabase
      .from("friends")
      .select("friend_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("fetchFriends error:", error);
      return [];
    }
    if (!rows || rows.length === 0) return [];

    const friendIds = rows.map(r => r.friend_id);

    // 2) hent profiler til alle vennene
    const { data: profiles, error: profErr } = await vmSupabase
      .from("profiles")
      .select("id, username")
      .in("id", friendIds);

    if (profErr) {
      console.error("fetchFriends profiles error:", profErr);
      return [];
    }

    const byId = new Map((profiles || []).map(p => [p.id, p]));

    // 3) slå sammen data
    return rows.map(r => ({
      id: r.friend_id,
      username: byId.get(r.friend_id)?.username || "(no name)",
      created_at: r.created_at
    }));
  } catch (e) {
    console.error("fetchFriends exception:", e);
    return [];
  }
}

function renderFriendsList(friends) {
  const listEl = document.getElementById("friendsList");
  const msgEl = document.getElementById("socialMessage");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!friends || friends.length === 0) {
    if (msgEl && !msgEl.textContent) {
      msgEl.textContent = "No friends yet – add someone by username.";
    }
    return;
  }

  for (const f of friends) {
    const li = document.createElement("li");

    const left = document.createElement("div");
    left.className = "friend-name";
    left.textContent = f.username;

    const right = document.createElement("div");
    right.className = "friend-meta";

    const tradeBtn = document.createElement("button");
    tradeBtn.className = "btn tiny";
    tradeBtn.textContent = "Trade";
    tradeBtn.addEventListener("click", () => openTradeWithFriend(f));

    right.appendChild(tradeBtn);

    li.appendChild(left);
    li.appendChild(right);
    listEl.appendChild(li);
  }

}

async function addFriendByName(rawName) {
  const name = (rawName || "").trim();
  const msgEl = document.getElementById("socialMessage");
  const inputEl = document.getElementById("friendSearchInput");

  if (!name) {
    if (msgEl) msgEl.textContent = "Type a username first.";
    return;
  }

  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) {
    if (msgEl) msgEl.textContent = "Not connected – try reloading the page.";
    return;
  }

  try {
    // 1) Prøv eksakt match (uten wildcard)
    let { data: target, error: profErr } = await vmSupabase
      .from("profiles")
      .select("id, username")
      .eq("username", name)
      .maybeSingle();

    console.log("addFriend primary search result:", { target, profErr });

    // 2) Hvis ingen rad: prøv en mer tolerant søk med wildcard
    if (!target && !profErr) {
      const { data: fallbackRows, error: fbErr } = await vmSupabase
        .from("profiles")
        .select("id, username")
        .ilike("username", `%${name}%`)
        .limit(1);

      console.log("addFriend fallback search result:", { fallbackRows, fbErr });

      if (!fbErr && fallbackRows && fallbackRows.length > 0) {
        target = fallbackRows[0];
      } else if (fbErr) {
        profErr = fbErr;
      }
    }

    if (profErr) {
      console.error("addFriend profile error:", profErr);
      if (msgEl) msgEl.textContent = "Error looking up user.";
      return;
    }

    if (!target) {
      if (msgEl) msgEl.textContent = `No user with username "${name}" found.`;
      return;
    }

    if (target.id === userId) {
      if (msgEl) msgEl.textContent = "You can't add yourself 🤝";
      return;
    }

    // sjekk om allerede friend
    const { data: existing, error: exErr } = await vmSupabase
      .from("friends")
      .select("id")
      .eq("user_id", userId)
      .eq("friend_id", target.id)
      .maybeSingle();

    if (exErr) {
      console.error("addFriend existing error:", exErr);
    }

    if (existing) {
      if (msgEl) msgEl.textContent = `${target.username} is already your friend.`;
      return;
    }

    // legg til venn
    const { error: insErr } = await vmSupabase
      .from("friends")
      .insert({
        user_id: userId,
        friend_id: target.id
      });

    if (insErr) {
      console.error("addFriend insert error:", insErr);
      if (msgEl) msgEl.textContent = "Could not add friend. Check your connection.";
      return;
    }

    if (msgEl) msgEl.textContent = `Added ${target.username} as friend.`;
    if (inputEl) inputEl.value = "";

    // oppdater lista
    const friends = await fetchFriends();
    renderFriendsList(friends);
  } catch (e) {
    console.error("addFriend exception:", e);
    if (msgEl) msgEl.textContent = "Unexpected error while adding friend.";
  }
}


async function loadSocial() {
  const friends = await fetchFriends();
  renderFriendsList(friends);
}

function openPublicProfileModal(profile, saveRow) {
  const modal = document.getElementById("publicProfileModal");
  if (!modal) return;

  const nameEl    = document.getElementById("publicProfileName");
  const titleEl   = document.getElementById("publicProfileTitle");
  const createdEl = document.getElementById("publicProfileCreated");
  const gridEl    = document.getElementById("publicProfileFeaturedGrid");
  const emptyEl   = document.getElementById("publicProfileNoFeatured");

  // plukk title fra saves først, ellers fra profile
  const currentTitleId =
    (saveRow && saveRow.current_title_id) ||
    profile?.current_title_id ||
    null;

  if (nameEl)  nameEl.textContent  = profile?.username || "(no name)";
  if (titleEl) titleEl.textContent = getTitleLabelById(currentTitleId);

  if (createdEl) {
    let txt = "Unknown";
    if (profile?.created_at) {
      txt = new Date(profile.created_at).toLocaleString();
    }
    createdEl.textContent = txt;
  }

  // Featured items
  if (gridEl) {
    gridEl.innerHTML = "";

    const inv    = (saveRow && saveRow.inventory) || {};
    const slots  = Array.isArray(saveRow?.featured_slots) ? saveRow.featured_slots : [];
    const items  = slots.map(id => inv[id]).filter(Boolean);

    if (!items.length) {
      if (emptyEl) {
        emptyEl.style.display = "";
        emptyEl.textContent = "This player has no featured items yet.";
      }
    } else {
      if (emptyEl) emptyEl.style.display = "none";

      for (const item of items) {
        const wrapper = document.createElement("div");
        wrapper.className = "profile-feature-slot";

        const inner = document.createElement("div");
        inner.className = "profile-feature-slot-inner";
        inner.innerHTML = `
          <img src="${item.img}" alt="${item.name}">
          <div class="profile-feature-name">${item.name}</div>
          <div class="muted" style="font-size:12px;">x${item.count || 1} • ${item.rarity}</div>
        `;

        wrapper.appendChild(inner);
        gridEl.appendChild(wrapper);
      }
    }
  }

  modal.classList.remove("hidden");
}

function closePublicProfileModal() {
  const modal = document.getElementById("publicProfileModal");
  if (modal) modal.classList.add("hidden");
}

async function openPublicProfileByName(rawName) {
  const name   = (rawName || "").trim();
  const msgEl  = document.getElementById("socialMessage");

  if (!name) {
    if (msgEl) msgEl.textContent = "Type a username first.";
    return;
  }

  const session = getSession?.();
  const userId  = session?.userId;

  if (!vmSupabase || !userId) {
    if (msgEl) msgEl.textContent = "Not connected – try reloading the page.";
    return;
  }

  try {
    // 1) Finn profil (først eksakt match)
    let { data: profile, error: profErr } = await vmSupabase
      .from("profiles")
      .select("id, username, created_at, current_title_id")
      .eq("username", name)
      .maybeSingle();

    // 2) Hvis ingen, prøv en ilike-wildcard på username
    if (!profile && !profErr) {
      const { data: fallbackRows, error: fbErr } = await vmSupabase
        .from("profiles")
        .select("id, username, created_at, current_title_id")
        .ilike("username", `%${name}%`)
        .limit(1);

      if (!fbErr && fallbackRows && fallbackRows.length > 0) {
        profile = fallbackRows[0];
      } else if (fbErr) {
        profErr = fbErr;
      }
    }

    if (profErr) {
      console.error("openPublicProfileByName profile error:", profErr);
      if (msgEl) msgEl.textContent = "Error looking up user.";
      return;
    }

    if (!profile) {
      if (msgEl) msgEl.textContent = `No user with username "${name}" found.`;
      return;
    }

    // 3) Hent save-raden for denne brukeren (featured_slots + inventory + current_title_id)
    const { data: saveRow, error: saveErr } = await vmSupabase
      .from("saves")
      .select("featured_slots, inventory, current_title_id")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (saveErr) {
      console.error("openPublicProfileByName save error:", saveErr);
      // Vi kan fortsatt vise profil-info uten featured items
    }

    openPublicProfileModal(profile, saveRow || null);
    if (msgEl) msgEl.textContent = "";
  } catch (e) {
    console.error("openPublicProfileByName exception:", e);
    if (msgEl) msgEl.textContent = "Unexpected error while loading profile.";
  }
}

function openTradeWithFriend(friend){
  currentTradeFriend = friend;
  currentTradeOffer = {};

  const nameEl = document.getElementById("tradeFriendName");
  if (nameEl) nameEl.textContent = friend.username;

  renderTradeOfferPicker();
  showTradeModal();
}

function renderTradeOfferPicker(){
  const listEl = document.getElementById("tradeOfferList");
  if (!listEl) return;

  listEl.innerHTML = "";

  const allItems = Object.values(state.inventory || {});
  if (!allItems.length) {
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = "You don't have any items to trade yet.";
    listEl.appendChild(p);
    return;
  }

  for (const it of allItems) {
    const row = document.createElement("div");
    row.className = "trade-row";

    const main = document.createElement("div");
    main.className = "trade-row-main";

    const name = document.createElement("div");
    name.className = "trade-row-name";
    name.textContent = it.name;

    const meta = document.createElement("div");
    meta.className = "trade-row-meta";
    meta.textContent = `${it.rarity} • You own x${it.count}`;

    main.appendChild(name);
    main.appendChild(meta);

    const controls = document.createElement("div");
    controls.className = "trade-row-controls";

    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.className = "btn tiny";

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.className = "btn tiny";

    const badge = document.createElement("span");
    badge.className = "trade-count-badge";
    const selected = currentTradeOffer[it.id] || 0;
    badge.textContent = "x" + selected;

    minus.addEventListener("click", () => {
      const cur = currentTradeOffer[it.id] || 0;
      const next = Math.max(0, cur - 1);
      if (next === 0) delete currentTradeOffer[it.id];
      else currentTradeOffer[it.id] = next;
      renderTradeOfferPicker();
    });

    plus.addEventListener("click", () => {
      const cur = currentTradeOffer[it.id] || 0;
      const owned = it.count || 0;
      if (cur >= owned) return; // kan ikke sende mer enn du eier
      currentTradeOffer[it.id] = cur + 1;
      renderTradeOfferPicker();
    });

    controls.appendChild(minus);
    controls.appendChild(badge);
    controls.appendChild(plus);

    row.appendChild(main);
    row.appendChild(controls);
    listEl.appendChild(row);
  }
}

async function submitTrade(){
  const msgEl = document.getElementById("tradeError");
  if (msgEl) msgEl.textContent = "";

  if (!currentTradeFriend) {
    if (msgEl) msgEl.textContent = "No friend selected.";
    return;
  }

  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) {
    if (msgEl) msgEl.textContent = "Not connected to server.";
    return;
  }

  const itemIds = Object.keys(currentTradeOffer || {})
    .filter(id => (currentTradeOffer[id] || 0) > 0);

  if (!itemIds.length) {
    if (msgEl) msgEl.textContent = "Select at least one item to send.";
    return;
  }

  // bygg payload + sjekk inventory
  const offerPayload = {};
  for (const id of itemIds) {
    const it = state.inventory[id];
    if (!it) continue;
    const sendCount = currentTradeOffer[id];

    if (sendCount > (it.count || 0)) {
      if (msgEl) msgEl.textContent = "You don't have enough of " + it.name + ".";
      return;
    }

    offerPayload[id] = {
      id: it.id,
      name: it.name,
      rarity: it.rarity,
      img: it.img,
      value: it.value,
      count: sendCount,
    };
  }

  try {
    const fromUsername = session?.username || profileMeta?.username || "unknown";

    const { error } = await vmSupabase
      .from("trades")
      .insert({
        from_user_id: userId,
        to_user_id: currentTradeFriend.id,
        from_username: fromUsername,
        to_username: currentTradeFriend.username,
        offer: offerPayload,
        status: "pending",
      });

    if (error) {
      console.error("submitTrade insert error:", error);
      if (msgEl) msgEl.textContent = "Could not send trade.";
      return;
    }

    // trekk items ut av inventory lokalt
    for (const id of itemIds) {
      const sendCount = currentTradeOffer[id];
      const it = state.inventory[id];
      if (!it) continue;
      it.count -= sendCount;
      if (it.count <= 0) delete state.inventory[id];
    }

    await save();
    renderInventory(getInventoryFilter(), getInventorySearch());
    renderProfile?.();

    hideTradeModal();
    showToast("Trade sent to " + currentTradeFriend.username + "!");
  } catch (e) {
    console.error("submitTrade exception:", e);
    if (msgEl) msgEl.textContent = "Unexpected error when sending trade.";
  }
}

/* ---------- TRADES LIST / INBOX ---------- */

async function fetchTradesForCurrentUser(){
  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) return [];

  try {
    const { data, error } = await vmSupabase
      .from("trades")
      .select("*")
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchTrades error:", error);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error("fetchTrades exception:", e);
    return [];
  }
}


function summarizeTradeOffer(trade){
  const offer = trade.offer || {};
  const items = Object.values(offer);
  if (!items.length) return "No items?";

  const unique = items.length;
  const total = items.reduce((sum, it) => sum + (it.count || 0), 0);
  return `${unique} item(s) • x${total} total`;
}

function renderTradesLists(trades){
  const session = getSession?.();
  const myId = session?.userId;

  const openInEl  = document.getElementById("openTradesIncoming");
  const openOutEl = document.getElementById("openTradesOutgoing");
  const histEl    = document.getElementById("tradeHistoryList");

  if (openInEl)  openInEl.innerHTML  = "";
  if (openOutEl) openOutEl.innerHTML = "";
  if (histEl)    histEl.innerHTML    = "";

  if (!myId) return;

  const pendingIncoming = trades.filter(t => t.status === "pending" && t.to_user_id   === myId);
  const pendingOutgoing = trades.filter(t => t.status === "pending" && t.from_user_id === myId);
  const historyTrades   = trades.filter(t => t.status !== "pending");

  // --- OPEN INCOMING ---
  if (openInEl){
    if (!pendingIncoming.length){
      const p = document.createElement("p");
      p.className = "muted small";
      p.textContent = "No incoming trades.";
      openInEl.appendChild(p);
    } else {
      for (const t of pendingIncoming){
        const li = document.createElement("li");
        li.className = "trade-row";

        const main = document.createElement("div");
        main.className = "trade-row-main";

        const title = document.createElement("div");
        title.className = "trade-row-name";
        title.textContent = `From ${t.from_username || "unknown"}`;

        const meta = document.createElement("div");
        meta.className = "trade-row-meta";
        const dateStr = t.created_at ? new Date(t.created_at).toLocaleString() : "";
        meta.textContent = `${tradeItemsSummary(t)} • ${dateStr}`;

        main.appendChild(title);
        main.appendChild(meta);

        const controls = document.createElement("div");
        controls.className = "trade-row-controls";

        const acceptBtn = document.createElement("button");
        acceptBtn.className = "btn tiny";
        acceptBtn.textContent = "Accept";
        acceptBtn.addEventListener("click", () => acceptTrade(t));

        const declineBtn = document.createElement("button");
        declineBtn.className = "btn tiny";
        declineBtn.textContent = "Decline";
        declineBtn.addEventListener("click", () => declineTrade(t));

        controls.appendChild(acceptBtn);
        controls.appendChild(declineBtn);

        li.appendChild(main);
        li.appendChild(controls);
        openInEl.appendChild(li);
      }
    }
  }

  // --- OPEN OUTGOING ---
  if (openOutEl){
    if (!pendingOutgoing.length){
      const p = document.createElement("p");
      p.className = "muted small";
      p.textContent = "No outgoing trades.";
      openOutEl.appendChild(p);
    } else {
      for (const t of pendingOutgoing){
        const li = document.createElement("li");
        li.className = "trade-row";

        const main = document.createElement("div");
        main.className = "trade-row-main";

        const title = document.createElement("div");
        title.className = "trade-row-name";
        title.textContent = `To ${t.to_username || "unknown"}`;

        const meta = document.createElement("div");
        meta.className = "trade-row-meta";
        const dateStr = t.created_at ? new Date(t.created_at).toLocaleString() : "";
        meta.textContent = `${tradeItemsSummary(t)} • ${dateStr}`;

        main.appendChild(title);
        main.appendChild(meta);

        const status = document.createElement("span");
        status.className = "trade-row-meta";
        status.textContent = "pending";

        li.appendChild(main);
        li.appendChild(status);
        openOutEl.appendChild(li);
      }
    }
  }

  // --- HISTORY (alle ikke-pending, både inn og ut) ---
  if (histEl){
    if (!historyTrades.length){
      const p = document.createElement("p");
      p.className = "muted small";
      p.textContent = "No trade history yet.";
      histEl.appendChild(p);
    } else {
      for (const t of historyTrades){
        const li = document.createElement("li");
        li.className = "trade-row";

        const main = document.createElement("div");
        main.className = "trade-row-main";

        const youAreSender = t.from_user_id === myId;
        const otherName = youAreSender ? (t.to_username || "friend") : (t.from_username || "friend");
        const dirText = youAreSender ? `To ${otherName}` : `From ${otherName}`;

        const title = document.createElement("div");
        title.className = "trade-row-name";
        title.textContent = dirText;

        const meta = document.createElement("div");
        meta.className = "trade-row-meta";
        const dateStr = t.created_at ? new Date(t.created_at).toLocaleString() : "";
        meta.textContent = `${tradeItemsSummary(t)} • ${t.status} • ${dateStr}`;

        main.appendChild(title);
        main.appendChild(meta);

        li.appendChild(main);
        histEl.appendChild(li);
      }
    }
  }
}


function tradeItemsSummary(trade, limit = 2){
  const offer = trade.offer || {};
  const items = Object.values(offer);
  if (!items.length) return "No items";

  const parts = items.map(it => {
    const count = it.count || 0;
    const name  = it.name  || "item";
    return `x${count} ${name}`;
  });

  if (parts.length > limit){
    const shown = parts.slice(0, limit).join(", ");
    const more = parts.length - limit;
    return `${shown} +${more} more`;
  }
  return parts.join(", ");
}


async function loadTrades(){
  const trades = await fetchTradesForCurrentUser();
  renderTradesLists(trades);
}

async function acceptTrade(trade){
  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) return;

  try {
    // prøv å sette status -> accepted, men bare hvis den fortsatt er pending
    const { data, error } = await vmSupabase
      .from("trades")
      .update({ status: "accepted" })
      .eq("id", trade.id)
      .eq("to_user_id", userId)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    if (error) {
      console.error("acceptTrade update error:", error);
      showToast("Could not accept trade.");
      return;
    }

    if (!data) {
      showToast("This trade was already handled.");
      await loadTrades();
      return;
    }

    const offer = data.offer || trade.offer || {};
    const items = Object.values(offer);

    // legg til items i inventory
    for (const it of items) {
      if (!it || !it.id) continue;
      const existing = state.inventory[it.id];
      const addCount = it.count || 0;

      if (existing) {
        existing.count = (existing.count || 0) + addCount;
      } else {
        state.inventory[it.id] = {
          id: it.id,
          name: it.name,
          rarity: it.rarity,
          img: it.img,
          value: it.value,
          count: addCount,
        };
      }
    }

    await save();
    renderInventory(getInventoryFilter(), getInventorySearch());
    renderProfile?.();
    showToast(`Trade from ${data.from_username || trade.from_username || "friend"} accepted.`);

    await loadTrades();
  } catch (e) {
    console.error("acceptTrade exception:", e);
    showToast("Unexpected error when accepting trade.");
  }
}

async function declineTrade(trade){
  const session = getSession?.();
  const userId = session?.userId;
  if (!vmSupabase || !userId) return;

  try {
    // sett status -> declined, men bare hvis den fortsatt er pending
    const { data, error } = await vmSupabase
      .from("trades")
      .update({ status: "declined" })
      .eq("id", trade.id)
      .eq("to_user_id", userId)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    if (error) {
      console.error("declineTrade error:", error);
      showToast("Could not decline trade.");
      return;
    }

    // Hvis data er null => ingen rad oppdatert (allerede håndtert)
    if (!data) {
      showToast("This trade was already handled.");
      await loadTrades();
      return;
    }

    // Her vet vi at vi nettopp gikk fra pending -> declined
    // => gi items tilbake til sender
    await restoreTradeItemsToSender(data);

    showToast("Trade declined.");
    await loadTrades();
  } catch (e) {
    console.error("declineTrade exception:", e);
    showToast("Unexpected error when declining trade.");
  }
}


async function restoreTradeItemsToSender(trade){
  if (!vmSupabase || !trade || !trade.from_user_id) return;

  try {
    const senderId = trade.from_user_id;

    const { data, error } = await vmSupabase
      .from("saves")
      .select("inventory")
      .eq("user_id", senderId)
      .maybeSingle();

    if (error) {
      console.error("restoreTradeItemsToSender load error:", error);
      return;
    }

    const inv = data?.inventory || {};
    const offer = trade.offer || {};
    const items = Object.values(offer);

    for (const it of items) {
      if (!it || !it.id) continue;
      const addCount = it.count || 0;
      if (addCount <= 0) continue;

      const existing = inv[it.id];
      if (existing) {
        existing.count = (existing.count || 0) + addCount;
      } else {
        inv[it.id] = {
          id: it.id,
          name: it.name,
          rarity: it.rarity,
          img: it.img,
          value: it.value,
          count: addCount,
        };
      }
    }

    const { error: updErr } = await vmSupabase
      .from("saves")
      .update({ inventory: inv })
      .eq("user_id", senderId);

    if (updErr) {
      console.error("restoreTradeItemsToSender update error:", updErr);
    }
  } catch (e) {
    console.error("restoreTradeItemsToSender exception:", e);
  }
}



document.addEventListener("DOMContentLoaded", () => {
  mount();
});
