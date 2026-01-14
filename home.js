
// ---------- Supabase (Home) ----------
const VM_APP_SUPABASE_URL = "https://vsasxahjavdstcrcsghg.supabase.co";
const VM_APP_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzYXN4YWhqYXZkc3RjcmNzZ2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyNDI4MzgsImV4cCI6MjA3ODgxODgzOH0.g3DF07JppjF19-7FT7wNk--Ns7wbC83jcC-eZtjoiGs";

let homeSupabase = null;
if (typeof window !== "undefined" && window.supabase) {
  homeSupabase = window.supabase.createClient(VM_APP_SUPABASE_URL, VM_APP_SUPABASE_ANON_KEY);
}

// ---------- Players Online (Presence observer) ----------
let onlinePresenceChannel = null;

function fmtNumber(n) {
  return new Intl.NumberFormat("en-US").format(n || 0);
}

function countPresenceUsers(presenceState) {
  // presenceState: { [key]: [{...}, {...}] }
  // Vi teller unike keys (hver key = én spiller)
  return Object.keys(presenceState || {}).length;
}

function startPlayersOnlinePresenceObserver() {
  // Hvis supabase ikke er lastet: vis 0 / —
  if (!homeSupabase) {
    const el = document.getElementById("playersOnline");
    if (el) el.textContent = "—";
    return;
  }

  // Unngå dobbel-subscribe
  if (onlinePresenceChannel) return;

  onlinePresenceChannel = homeSupabase.channel("vm_online_players", {
    config: {
      presence: {
        // Home tracker ikke seg selv; dette er bare en observer.
        // key er irrelevant så lenge vi ikke kaller track().
        key: "home_observer"
      }
    }
  });

  const update = () => {
    const state = onlinePresenceChannel.presenceState();
    const online = countPresenceUsers(state);
    const el = document.getElementById("playersOnline");
    if (el) el.textContent = fmtNumber(online);
  };

  onlinePresenceChannel
    .on("presence", { event: "sync" }, update)
    .on("presence", { event: "join" }, update)
    .on("presence", { event: "leave" }, update)
    .subscribe((status) => {
      // Når vi er subscribed: oppdater (kan være 0 hvis ingen tracker enda)
      if (status === "SUBSCRIBED") update();
    });

  // Poll fallback (hvis sync-event ikke fyrer i enkelte miljøer)
  setInterval(update, 5000);
}



// ---- Placeholder content (kan byttes til Supabase senere) ----
const NEWS = [
  {
    title: "Profile Upgrade Update (Coming Soon)",
    date: "2026-01-12",
    tag: "Update",
    body: "Player Cards, custom backgrounds, featured showcase and titles are arriving. Public profile search will be available on this page.",
    link: "#news"
  },
  {
    title: "Market Improvements",
    date: "2026-01-05",
    tag: "Market",
    body: "Server-authoritative market actions are now live: listings, cancel and buy are handled by the database for better security and consistency.",
    link: "#news"
  }
];

let newsIndex = 0;

function setText(id, text){
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function renderNews(){
  const post = NEWS[newsIndex] || NEWS[0];
  setText("newsTitle", post.title);
  setText("newsDate", post.date);
  setText("newsTag", post.tag);
  setText("newsBody", post.body);

  const link = document.getElementById("newsLink");
  if (link) link.href = post.link || "#news";
}

function openModal(){
  const modal = document.getElementById("playerModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(){
  const modal = document.getElementById("playerModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
}

function wireModal(){
  const modal = document.getElementById("playerModal");
  if (!modal) return;

  modal.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.close === "true") closeModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// ---- Total boxes opened  ----

async function fetchTotalBoxesOpened(){
  try {
    if (!homeSupabase) return null;

    const { data, error } = await homeSupabase.rpc("get_total_boxes_opened");
    if (error) {
      console.error("get_total_boxes_opened rpc error:", error);
      return null;
    }

    // data er bigint/number (avhenger av klient), gjør robust:
    const n = Number(data);
    if (!Number.isFinite(n)) return null;
    return n;
  } catch (e) {
    console.error("fetchTotalBoxesOpened exception:", e);
    return null;
  }
}

function titleFromId(id){
  if (!id) return "No title equipped";
  // enkel “pretty” fallback (du kan bytte til ekte title-map senere)
  return String(id)
    .replace(/^title_/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function searchPublicProfiles(q, limit = 8){
  if (!homeSupabase) return [];

  const { data, error } = await homeSupabase.rpc("vm_search_public_profiles", {
    p_query: q,
    p_limit: limit
  });

  if (error) {
    console.error("vm_search_public_profiles error:", error);
    return [];
  }

  return Array.isArray(data) ? data : [];
}

async function fetchPublicProfile(username){
  if (!homeSupabase) return null;

  const { data, error } = await homeSupabase.rpc("vm_get_public_profile", {
    p_username: username
  });

  if (error) {
    console.error("vm_get_public_profile error:", error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

async function openHomePlayerModal(username){
  const pub = await fetchPublicProfile(username);
  if (!pub) return;

  // top
  setText("playerName", pub.username || "—");
  setText("playerTitle", titleFromId(pub.current_title_id));

  // background/avatar (home har bare “div”, bruk default visuals her)
  const bg = document.getElementById("playerBg");
  if (bg) bg.style.backgroundImage = `url("assets/home/player-bg.jpg")`;

  const av = document.getElementById("playerAvatar");
  if (av) av.style.backgroundImage = `url("assets/home/avatar.png")`;

  // featured items (MAX 3)
  const grid = document.getElementById("playerFeatured");
  if (grid) {
    grid.innerHTML = "";
    const items = Array.isArray(pub.featured_items) ? pub.featured_items : [];
    const show = items.slice(0, 3);

    for (const it of show){
      const cell = document.createElement("div");
      cell.className = "showcase-item";
      cell.innerHTML = `
        <img src="${it.img}" alt="${escapeHtml(it.name)}" />
        <div class="small">${escapeHtml(it.name)}</div>
      `;
      grid.appendChild(cell);
    }

    // tomme slots opp til 3
    for (let i = show.length; i < 3; i++){
      const cell = document.createElement("div");
      cell.className = "showcase-item empty";
      cell.innerHTML = `<div class="small">—</div>`;
      grid.appendChild(cell);
    }
  }


  // meta
  const meta = document.getElementById("playerMeta");
  if (meta) {
    const joined = pub.created_at
      ? new Date(pub.created_at).toLocaleString()
      : "—";

    const boxes = Number(pub.boxes_opened || 0);

    meta.innerHTML = `
      <div class="meta-row"><span>Joined</span><span>${escapeHtml(joined)}</span></div>
      <div class="meta-row"><span>Boxes Opened</span><span>${boxes}</span></div>
    `;
  }


  openModal();
}

function renderResults(list){
  const host = document.getElementById("searchResults");
  if (!host) return;
  host.innerHTML = "";

  if (!list.length){
    host.innerHTML = `
      <div class="result">
        <div class="result-name">No results</div>
        <div class="result-sub">Try another username.</div>
      </div>
    `;
    return;
  }

  for (const p of list){
    const div = document.createElement("div");
    div.className = "result";
    div.innerHTML = `
      <div class="result-name">${escapeHtml(p.username)}</div>
      <div class="result-sub">${escapeHtml(titleFromId(p.current_title_id))}</div>
    `;
    div.addEventListener("click", () => openHomePlayerModal(p.username));
    host.appendChild(div);
  }
}


function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showPlayer(p){
  // background & avatar
  const bg = document.getElementById("playerBg");
  const av = document.getElementById("playerAvatar");
  if (bg) bg.style.backgroundImage = `linear-gradient(90deg, rgba(0,0,0,.85), rgba(0,0,0,.25), rgba(0,0,0,.85)), url("${p.backgroundImg}")`;
  if (av) av.style.backgroundImage = `radial-gradient(40px 40px at 30% 30%, rgba(214,177,91,.25), transparent 60%), url("${p.avatarImg}")`;

  setText("playerName", p.username);
  setText("playerTitle", p.title || "—");
  setText("playerLevel", `Level ${p.level ?? "—"}`);
  setText("playerXp", `XP ${p.xp ?? "—"}`);

  // featured grid
  const grid = document.getElementById("playerFeatured");
  if (grid){
    grid.innerHTML = "";
    const items = (p.featured || []).slice(0, 5);
    for (const it of items){
      const cell = document.createElement("div");
      cell.className = "showcase-item";
      cell.innerHTML = `
        <img src="${it.img}" alt="${escapeHtml(it.name)}" />
        <div class="small">${escapeHtml(it.name)}</div>
      `;
      grid.appendChild(cell);
    }
    // pad to 5
    for (let i = items.length; i < 5; i++){
      const cell = document.createElement("div");
      cell.className = "showcase-item";
      cell.innerHTML = `<div class="small">—</div>`;
      grid.appendChild(cell);
    }
  }

  // meta
  const meta = document.getElementById("playerMeta");
  if (meta){
    meta.innerHTML = `
      <div class="meta-row"><span>Joined</span><span>${escapeHtml(p.joined || "—")}</span></div>
      <div class="meta-row"><span>Boxes Opened</span><span>${escapeHtml(p.boxesOpened ?? "—")}</span></div>
      <div class="meta-row"><span>Legendaries</span><span>${escapeHtml(p.legendaries ?? "—")}</span></div>
    `;
  }

  openModal();
}

function wireSearch(){
  const input = document.getElementById("playerQuery");
  const btn   = document.getElementById("playerSearchBtn");

  const doSearch = async () => {
    const q = (input?.value || "").trim();
    if (!q) {
      renderResults([]);
      return;
    }

    const res = await searchPublicProfiles(q);
    renderResults(res);
  };

  if (btn) btn.addEventListener("click", doSearch);

  if (input){
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch();
    });
  }

  // Start tom
  renderResults([]);
}


function wireStats(){
  // Players Online (hvis du har lagt inn presence-greia fra i sted)
  startPlayersOnlinePresenceObserver?.();

  // Total Boxes Opened (global)
  const updateBoxes = async () => {
    const total = await fetchTotalBoxesOpened();
    if (total === null) {
      setText("marketListings", "—");
      return;
    }
    setText("marketListings", fmtNumber ? fmtNumber(total) : String(total));
  };

  updateBoxes();
  setInterval(updateBoxes, 30000); // oppdater hvert 30. sekund

  // Latest patch (kan du gjøre live senere)
  setText("latestPatch", "Profile Upgrade (soon)");
}


function wireNewsNav(){
  const prev = document.getElementById("newsPrev");
  const next = document.getElementById("newsNext");

  prev?.addEventListener("click", () => {
    newsIndex = (newsIndex - 1 + NEWS.length) % NEWS.length;
    renderNews();
  });

  next?.addEventListener("click", () => {
    newsIndex = (newsIndex + 1) % NEWS.length;
    renderNews();
  });
}

wireModal();
wireStats();
renderNews();
wireNewsNav();
wireSearch();
