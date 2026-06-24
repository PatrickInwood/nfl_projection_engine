// ── NFL Projection Engine — Frontend Logic ─────────────────────────────────
// All player data is fetched once and stored in `allPlayers` for instant
// filtering, search, and roster building without extra API calls.

let allPlayers = [];       // full ranked list (skill positions, current scoring)
let allRosterPlayers = []; // allPlayers + D/ST for roster builder search
let currentScoring = "ppr";
let myRoster = [];         // names added to roster builder

const POS_COLORS = { QB:"pos-QB", RB:"pos-RB", WR:"pos-WR", TE:"pos-TE", K:"pos-K", DEF:"pos-DEF" };

function weatherBadge(weather) {
  if (!weather) return "";
  if (weather.indoor) return `<span class="weather-badge dome" title="Indoor stadium — no weather impact">🏟️ Dome</span>`;
  const { icon, temp_f, wind_mph, precip_pct, condition } = weather;
  const tip = `${condition} · ${temp_f}°F · Wind ${wind_mph} mph · ${precip_pct}% precip`;
  const cls = wind_mph >= 20 || precip_pct >= 70 || temp_f <= 32 ? "weather-badge bad" : "weather-badge ok";
  let label = `${icon} ${temp_f}°F`;
  if (wind_mph >= 15) label += ` ${wind_mph}mph`;
  return `<span class="${cls}" title="${tip}">${label}</span>`;
}

// ESPN CDN team abbreviations differ from Sleeper for two teams
const ESPN_ABBR = { JAX: "jac", WAS: "wsh" };

function teamLogo(team, size = 36) {
  if (!team) return `<span class="headshot-placeholder" style="width:${size}px;height:${size}px;border-radius:6px;"></span>`;
  const abbr = (ESPN_ABBR[team] || team).toLowerCase();
  const url  = `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`;
  return `<img src="${url}" width="${size}" height="${size}"
    style="border-radius:6px;object-fit:contain;background:var(--surface2);padding:2px;"
    onerror="this.style.visibility='hidden'" alt="${team}">`;
}

function rankBadge(rank) {
  let cls = 'rank-normal';
  if      (rank === 1) cls = 'rank-1';
  else if (rank === 2) cls = 'rank-2';
  else if (rank === 3) cls = 'rank-3';
  else if (rank <= 10) cls = 'rank-top10';
  else if (rank <= 24) cls = 'rank-mid';
  return `<span class="rank-badge ${cls}">${rank}</span>`;
}

function headshot(player_id, name, size = 36) {
  if (!player_id) return `<span class="headshot-placeholder" style="width:${size}px;height:${size}px;"></span>`;
  return `<img class="headshot" src="https://sleepercdn.com/content/nfl/players/thumb/${player_id}.jpg"
    alt="${name}" width="${size}" height="${size}"
    onerror="this.style.display='none'">`;
}

// ── D/ST default settings (Triple Flex) ───────────────────────────────────
const DEFAULT_DST = {
  pa0:5, pa1:4, pa7:3, pa14:1, pa18:0, pa22:0, pa28:-1, pa35:-3, pa46:-5,
  ya100:5, ya199:3, ya299:2, ya349:0, ya399:-1, ya449:-3, ya499:-5, ya549:-6, ya550:-7,
  sk:1, int:2, fr:2, sf:2, blkk:2, td:6,
};
const DST_LABELS = {
  pa0:"Shutout (0 pts allowed)", pa1:"1–6 pts allowed", pa7:"7–13 pts allowed",
  pa14:"14–17 pts allowed", pa18:"18–21 pts allowed", pa22:"22–27 pts allowed",
  pa28:"28–34 pts allowed", pa35:"35–45 pts allowed", pa46:"46+ pts allowed",
  ya100:"< 100 yds allowed", ya199:"100–199 yds", ya299:"200–299 yds",
  ya349:"300–349 yds", ya399:"350–399 yds", ya449:"400–449 yds",
  ya499:"450–499 yds", ya549:"500–549 yds", ya550:"550+ yds",
  sk:"Each sack", int:"Each interception", fr:"Each fumble recovered",
  sf:"Each safety", blkk:"Blocked kick", td:"Def/ST touchdown",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function renderMarkdown(text) {
  return text
    .replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>')  // # headers → bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')      // **bold**
    .replace(/\*(.+?)\*/g, '<em>$1</em>')                  // *italic*
    .replace(/\n/g, '<br>');                               // newlines
}

function posBadge(pos) {
  const cls = POS_COLORS[pos] || "";
  return `<span class="pos-badge ${cls}">${pos}</span>`;
}

function injTag(status) {
  if (!status || status.toLowerCase() === "active") return "";
  return `<span class="inj-tag">${status}</span>`;
}

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const sec = document.getElementById(`tab-${tabId}`);
  if (btn) btn.classList.add("active");
  if (sec) sec.classList.add("active");
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// Home page feature cards → switch to their tab on click
document.querySelectorAll(".home-card[data-goto]").forEach(card => {
  card.addEventListener("click", () => switchTab(card.dataset.goto));
});

// ── Load & render rankings ─────────────────────────────────────────────────
async function loadRankings() {
  const scoring  = document.getElementById("scoring-select").value;
  const pos      = document.querySelector(".pos-btn.active")?.dataset.pos || "ALL";
  const hideBye  = document.getElementById("hide-bye").checked;
  currentScoring = scoring;

  // D/ST uses its own endpoint and renderer
  if (pos === "DEF") {
    await loadDstRankings();
    return;
  }

  const url = `/api/players?scoring=${scoring}&position=${pos}&hide_bye=${hideBye}`;
  const res = await fetch(url);
  const data = await res.json();

  allPlayers = data.players;  // cache for start/sit and filtered views

  // allRosterPlayers needs ALL positions (K, DEF, etc.) regardless of Rankings filter.
  if (pos === "ALL") {
    allRosterPlayers = [...allPlayers];
  } else if (!allRosterPlayers.length) {
    fetch(`/api/players?scoring=${scoring}&position=ALL`)
      .then(r => r.json())
      .then(d => { allRosterPlayers = d.players || []; })
      .catch(() => { allRosterPlayers = [...allPlayers]; });
  }

  // Update week badge
  if (data.week) {
    document.getElementById("week-badge").textContent = `Week ${data.week} · ${data.season}`;
  }

  renderRankingsTable(data.players);
}

function renderRankingsTable(players) {
  const tbody = document.getElementById("rankings-body");
  if (!players.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading">No players found.</td></tr>`;
    return;
  }
  const maxPts = Math.max(...players.map(p => p.projection), 1);
  tbody.innerHTML = players.map((p, i) => {
    const rank = p.rank ?? i + 1;
    const pct  = Math.round((p.projection / maxPts) * 82);
    return `<tr>
      <td>${rankBadge(rank)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:.5rem;">
          ${headshot(p.player_id, p.name)}
          <strong>${p.name}</strong>
        </div>
      </td>
      <td>${posBadge(p.position)}</td>
      <td style="color:var(--text-2);">${p.team}</td>
      <td style="color:var(--text-2);font-size:.82rem;">
        ${p.opponent || "TBD"}
        ${p.weather ? `<br>${weatherBadge(p.weather)}` : ""}
      </td>
      <td>
        <div class="pts-bar-wrap">
          <div class="pts-bar" style="--pct:${pct}%"></div>
          <span class="pts-val">${p.projection.toFixed(2)}</span>
        </div>
      </td>
      <td>${injTag(p.injury_status)}</td>
    </tr>`;
  }).join("");
}

// Filter controls
document.querySelectorAll(".pos-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pos-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    loadRankings();
  });
});
document.getElementById("scoring-select").addEventListener("change", loadRankings);
document.getElementById("hide-bye").addEventListener("change", loadRankings);

// ── D/ST tab ───────────────────────────────────────────────────────────────
function buildDstSettingsUI() {
  const grid = document.getElementById("dst-settings-grid");
  grid.innerHTML = Object.entries(DEFAULT_DST).map(([key, val]) => `
    <div class="dst-setting-row">
      <label>${DST_LABELS[key] || key}</label>
      <input type="number" id="dst-${key}" value="${val}" step="1"/>
    </div>
  `).join("");
}

async function loadDstRankings() {
  // Renders D/ST into the main Rankings table (same layout, no scoring dropdowns)
  const tbody = document.getElementById("rankings-body");
  tbody.innerHTML = `<tr><td colspan="7" class="loading">Loading D/ST rankings…</td></tr>`;

  try {
    const res  = await fetch("/api/dst");
    const data = await res.json();
    const list = data.dst || [];

    if (data.week) {
      document.getElementById("week-badge").textContent = `Week ${data.week} · ${data.season}`;
    }

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="loading">No D/ST data available.</td></tr>`;
      return;
    }

    const maxDstPts = Math.max(...list.map(d => d.projection), 1);
    tbody.innerHTML = list.map((d, i) => {
      const rank = d.rank ?? i + 1;
      const pct  = Math.round((d.projection / maxDstPts) * 82);
      return `<tr>
        <td>${rankBadge(rank)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:.5rem;">
            ${teamLogo(d.team, 36)}
            <span style="font-weight:600;">${d.name}</span>
          </div>
        </td>
        <td>${posBadge("DEF")}</td>
        <td style="color:var(--text-2);">${d.team}</td>
        <td style="color:var(--text-2);font-size:.82rem;">—</td>
        <td>
          <div class="pts-bar-wrap">
            <div class="pts-bar" style="--pct:${pct}%"></div>
            <span class="pts-val">${d.projection.toFixed(2)}</span>
          </div>
        </td>
        <td>—</td>
      </tr>`;
    }).join("");
  } catch (e) {
    document.getElementById("rankings-body").innerHTML =
      `<tr><td colspan="7" class="loading">Error loading D/ST data.</td></tr>`;
  }
}

async function loadDst() {
  const settings = {};
  Object.keys(DEFAULT_DST).forEach(k => {
    const el = document.getElementById(`dst-${k}`);
    if (el) settings[k] = parseFloat(el.value);
  });

  const params = encodeURIComponent(JSON.stringify(settings));
  const res  = await fetch(`/api/dst?settings=${params}`);
  const data = await res.json();

  const tbody = document.getElementById("dst-body");
  if (!data.dst || !data.dst.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="loading">No D/ST data available.</td></tr>`;
    return;
  }
  const maxDst2Pts = Math.max(...data.dst.map(d => d.projection), 1);
  tbody.innerHTML = data.dst.map(d => {
    const pct = Math.round((d.projection / maxDst2Pts) * 82);
    return `<tr>
      <td>${rankBadge(d.rank)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:.5rem;">
          ${teamLogo(d.team, 32)}
          <strong>${d.name}</strong>
        </div>
      </td>
      <td>${posBadge("DEF")}</td>
      <td>
        <div class="pts-bar-wrap">
          <div class="pts-bar" style="--pct:${pct}%"></div>
          <span class="pts-val">${d.projection.toFixed(2)}</span>
        </div>
      </td>
    </tr>`;
  }).join("");
}

document.getElementById("dst-recalc-btn").addEventListener("click", loadDst);

// Load D/ST when tab is clicked
document.querySelector('[data-tab="dst"]').addEventListener("click", () => {
  loadDst();
});

// Roster Builder tab — ensure ALL positions (K + D/ST) are in the search pool
let rosterPoolLoaded = false;
document.querySelector('[data-tab="roster"]').addEventListener("click", async () => {
  if (rosterPoolLoaded) return;
  try {
    // Fetch all skill positions (includes K) with current scoring
    const scoring = document.getElementById("roster-scoring")?.value || "ppr";
    const [skillRes, dstRes] = await Promise.all([
      fetch(`/api/players?scoring=${scoring}&position=ALL`),
      fetch("/api/dst"),
    ]);
    const skillData = await skillRes.json();
    const dstData   = await dstRes.json();

    const dstPlayers = (dstData.dst || []).map(d => ({
      name:          d.name,
      position:      "DEF",
      team:          d.team,
      projection:    d.projection,
      injury_status: "Active",
      player_id:     null,
    }));

    // Rebuild with all skill players (including K) + D/ST
    allRosterPlayers = [...(skillData.players || allPlayers), ...dstPlayers];
    rosterPoolLoaded = true;
  } catch (e) {
    // Fallback: at least ensure D/ST are present
    allRosterPlayers = [...allPlayers];
  }
});

// ── Player Search tab ──────────────────────────────────────────────────────
document.getElementById("search-input").addEventListener("input", function () {
  const q = this.value.toLowerCase().trim();
  const container = document.getElementById("search-results");

  if (!q) { container.innerHTML = ""; return; }

  const matches = allPlayers.filter(p => p.name.toLowerCase().includes(q)).slice(0, 20);

  if (!matches.length) {
    container.innerHTML = `<p style="color:#94a3b8;font-size:.88rem;">No players found for "${this.value}"</p>`;
    return;
  }

  container.innerHTML = matches.map(p => `
    <div class="player-card">
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.3rem;">
        ${headshot(p.player_id, p.name, 48)}
        <div>
          <div class="pc-name">${p.name}</div>
          <div>${posBadge(p.position)} <span style="color:#64748b;font-size:.78rem;">${p.team}</span> ${p.opponent && p.opponent !== "TBD" ? `<span style="color:#94a3b8;font-size:.75rem;">${p.opponent}</span>` : ""} ${injTag(p.injury_status)}</div>
          ${p.weather ? `<div style="margin-top:.2rem;">${weatherBadge(p.weather)}</div>` : ""}
        </div>
      </div>
      <div class="pc-pts">${p.projection.toFixed(2)} pts</div>
      <div class="pc-detail">Rank #${p.rank} overall</div>
    </div>
  `).join("");
});

// ── Roster Builder ─────────────────────────────────────────────────────────

// Load Triple Flex preset
document.getElementById("triple-flex-btn").addEventListener("click", () => {
  document.getElementById("slot-qb").value    = 1;
  document.getElementById("slot-rb").value    = 2;
  document.getElementById("slot-wr").value    = 2;
  document.getElementById("slot-te").value    = 1;
  document.getElementById("slot-flex").value  = 3;
  document.getElementById("slot-k").value     = 1;
  document.getElementById("slot-dst").value   = 1;
  document.getElementById("slot-bench").value = 7;
  document.getElementById("roster-scoring").value = "ppr";
  document.querySelectorAll(".flex-pos-cb").forEach(cb => cb.checked = true);
});

// Roster player search dropdown
const rosterSearch = document.getElementById("roster-search");
const rosterDropdown = document.getElementById("roster-dropdown");

rosterSearch.addEventListener("input", function () {
  const q = this.value.toLowerCase().trim();
  if (!q || !allRosterPlayers.length) { rosterDropdown.classList.add("hidden"); return; }

  const matches = allRosterPlayers
    .filter(p => p.name.toLowerCase().includes(q) && !myRoster.includes(p.name))
    .slice(0, 10);

  if (!matches.length) { rosterDropdown.classList.add("hidden"); return; }

  rosterDropdown.innerHTML = matches.map(p => `
    <li data-name="${p.name}">
      ${posBadge(p.position)}
      <span>${p.name}</span>
      <span style="color:#94a3b8;font-size:.78rem;margin-left:auto;">${p.team} · ${p.projection.toFixed(1)} pts</span>
    </li>
  `).join("");
  rosterDropdown.classList.remove("hidden");
});

rosterDropdown.addEventListener("click", e => {
  const li = e.target.closest("li");
  if (!li) return;
  addToRoster(li.dataset.name);
  rosterSearch.value = "";
  rosterDropdown.classList.add("hidden");
});

document.addEventListener("click", e => {
  if (!rosterSearch.contains(e.target)) rosterDropdown.classList.add("hidden");
});

function addToRoster(name) {
  if (myRoster.includes(name)) return;
  myRoster.push(name);
  renderRosterList();
}

function removeFromRoster(name) {
  myRoster = myRoster.filter(n => n !== name);
  renderRosterList();
}

function renderRosterList() {
  const list    = document.getElementById("my-roster-list");
  const countBar = document.getElementById("roster-count-bar");

  if (!myRoster.length) {
    list.innerHTML = `<li style="color:#94a3b8;font-size:.83rem;padding:.5rem 0;">No players added yet.</li>`;
    countBar.classList.add("hidden");
    return;
  }

  // Calculate expected starter count from slot inputs
  const starterSlots = ["slot-qb","slot-rb","slot-wr","slot-te","slot-flex","slot-k","slot-dst"]
    .reduce((sum, id) => sum + (parseInt(document.getElementById(id)?.value) || 0), 0);
  const benchSlots  = parseInt(document.getElementById("slot-bench")?.value) || 0;
  const total       = myRoster.length;
  const statusCls   = total < starterSlots ? "count-short" : total >= starterSlots ? "count-ok" : "";

  countBar.classList.remove("hidden");
  countBar.innerHTML = `
    <span class="${statusCls}">${total} player${total !== 1 ? "s" : ""} added</span>
    <span class="count-divider">·</span>
    <span>${starterSlots} starter slot${starterSlots !== 1 ? "s" : ""}</span>
    <span class="count-divider">·</span>
    <span>${benchSlots} bench slot${benchSlots !== 1 ? "s" : ""}</span>
    ${total < starterSlots ? `<span class="count-warn"> — need ${starterSlots - total} more to fill starters</span>` : ""}
  `;

  list.innerHTML = myRoster.map((name, i) => {
    const p      = allRosterPlayers.find(x => x.name === name);
    const icon   = p?.position === "DEF"
                    ? teamLogo(p.team, 28)
                    : headshot(p?.player_id, name, 28);
    const isBench = i >= starterSlots;
    return `<li class="${isBench ? "roster-bench-item" : ""}" style="display:flex;align-items:center;gap:.4rem;">
      ${icon}
      <span style="flex:1;">${p ? posBadge(p.position) : ""} ${name}${isBench ? ' <span class="bench-tag">Bench</span>' : ""}</span>
      <button class="remove-btn" onclick="removeFromRoster('${name.replace(/'/g,"\\'")}')">✕</button>
    </li>`;
  }).join("");
}

document.getElementById("clear-roster-btn").addEventListener("click", () => {
  myRoster = [];
  renderRosterList();
  document.getElementById("lineup-output").innerHTML =
    `<div class="lineup-placeholder">Add players and click Optimize Lineup to see your best starting lineup.</div>`;
});

// Optimize lineup
document.getElementById("optimize-btn").addEventListener("click", async () => {
  if (!myRoster.length) {
    alert("Add some players to your roster first.");
    return;
  }

  const flexPositions = Array.from(document.querySelectorAll(".flex-pos-cb:checked")).map(cb => cb.value);

  const payload = {
    roster: myRoster,
    settings: {
      scoring:         document.getElementById("roster-scoring").value,
      qb:              parseInt(document.getElementById("slot-qb").value),
      rb:              parseInt(document.getElementById("slot-rb").value),
      wr:              parseInt(document.getElementById("slot-wr").value),
      te:              parseInt(document.getElementById("slot-te").value),
      flex:            parseInt(document.getElementById("slot-flex").value),
      k:               parseInt(document.getElementById("slot-k").value),
      dst:             parseInt(document.getElementById("slot-dst").value),
      flex_positions:  flexPositions,
    }
  };

  const res  = await fetch("/api/lineup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  renderLineup(data);
});

function renderLineup(data) {
  const out = document.getElementById("lineup-output");
  if (!data.starters || !data.starters.length) {
    out.innerHTML = `<div class="lineup-placeholder">Could not build lineup. Make sure you have enough players for each slot.</div>`;
    return;
  }

  const starterRows = data.starters.map(p => `
    <div class="lineup-slot">
      <span class="slot-label">${p.slot}</span>
      ${posBadge(p.position)}
      <span class="ls-name">${p.name} <small style="color:#94a3b8">${p.team}</small></span>
      <span class="ls-pts">${p.projection.toFixed(2)}</span>
    </div>
  `).join("");

  const benchRows = data.bench.length ? `
    <div class="bench-header">Bench</div>
    ${data.bench.map(p => `
      <div class="lineup-slot" style="opacity:.65">
        <span class="slot-label">${p.slot}</span>
        ${posBadge(p.position)}
        <span class="ls-name">${p.name} <small style="color:#94a3b8">${p.team}</small></span>
        <span class="ls-pts">${p.projection.toFixed(2)}</span>
      </div>
    `).join("")}
  ` : "";

  const notFoundNote = data.not_found?.length
    ? `<p style="color:#ef4444;font-size:.78rem;margin-top:.5rem;">Not found: ${data.not_found.join(", ")}</p>`
    : "";

  out.innerHTML = starterRows + benchRows + notFoundNote;
}

// ── Start / Sit ────────────────────────────────────────────────────────────
function setupStartSit(inputId, dropdownId, cardId) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const card     = document.getElementById(cardId);
  let selectedPlayer = null;

  input.addEventListener("input", function () {
    const q = this.value.toLowerCase().trim();
    if (!q) { dropdown.classList.add("hidden"); return; }

    const matches = allPlayers.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { dropdown.classList.add("hidden"); return; }

    dropdown.innerHTML = matches.map(p => `
      <li data-name="${p.name}">
        ${posBadge(p.position)} <span>${p.name}</span>
        <span style="color:#94a3b8;font-size:.78rem;margin-left:auto;">${p.projection.toFixed(1)} pts</span>
      </li>
    `).join("");
    dropdown.classList.remove("hidden");
  });

  dropdown.addEventListener("click", e => {
    const li = e.target.closest("li");
    if (!li) return;
    const name = li.dataset.name;
    selectedPlayer = allPlayers.find(p => p.name === name);
    input.value = name;
    dropdown.classList.add("hidden");

    card.innerHTML = `
      ${headshot(selectedPlayer.player_id, selectedPlayer.name, 56)}
      <div class="sc-name">${selectedPlayer.name}</div>
      <div>${posBadge(selectedPlayer.position)} ${selectedPlayer.team}</div>
      <div class="sc-pts">${selectedPlayer.projection.toFixed(2)}</div>
    `;
    card.classList.remove("empty");

    tryCompare();
  });

  document.addEventListener("click", e => {
    if (!input.contains(e.target)) dropdown.classList.add("hidden");
  });

  return () => selectedPlayer;
}

const getP1 = setupStartSit("ss-p1", "ss-p1-dropdown", "ss-p1-card");
const getP2 = setupStartSit("ss-p2", "ss-p2-dropdown", "ss-p2-card");

function tryCompare() {
  const p1 = getP1();
  const p2 = getP2();
  const result = document.getElementById("ss-result");

  if (!p1 || !p2) return;

  const p1Card = document.getElementById("ss-p1-card");
  const p2Card = document.getElementById("ss-p2-card");

  if (p1.projection === p2.projection) {
    p1Card.className = "ss-card";
    p2Card.className = "ss-card";
    result.className = "ss-result";
    result.innerHTML = `<div class="start-label">Projected Tie</div><div class="edge-label">Coin flip — check injury reports</div>`;
    return;
  }

  const [starter, sitter] = p1.projection > p2.projection ? [p1, p2] : [p2, p1];
  const edge = Math.abs(p1.projection - p2.projection).toFixed(2);

  const starterCard = starter.name === p1.name ? p1Card : p2Card;
  const sitterCard  = starter.name === p1.name ? p2Card : p1Card;
  starterCard.className = "ss-card winner";
  sitterCard.className  = "ss-card loser";

  result.className = "ss-result";
  result.innerHTML = `
    <div class="start-label">START: ${starter.name}</div>
    <div class="edge-label">+${edge} projected point edge over ${sitter.name}</div>
    <button class="btn-why" id="why-btn" onclick="explainStartSit()">✦ Ask Claude Why</button>
    <div id="claude-analysis" class="claude-analysis hidden"></div>
  `;
}

async function explainStartSit() {
  const p1 = getP1();
  const p2 = getP2();
  if (!p1 || !p2) return;

  const btn = document.getElementById("why-btn");
  const box = document.getElementById("claude-analysis");
  btn.disabled = true;
  btn.textContent = "Analyzing…";
  box.classList.add("hidden");

  try {
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player1: { name: p1.name, position: p1.position, team: p1.team, projection: p1.projection, rank: p1.rank },
        player2: { name: p2.name, position: p2.position, team: p2.team, projection: p2.projection, rank: p2.rank },
        scoring: currentScoring,
      }),
    });
    const data = await res.json();
    if (data.error) {
      box.textContent = "Error: " + data.error;
    } else {
      box.innerHTML = renderMarkdown(data.analysis);
    }
    box.classList.remove("hidden");
    btn.textContent = "✦ Ask Claude Again";
  } catch (err) {
    box.textContent = "Could not reach Claude. Check API key.";
    box.classList.remove("hidden");
    btn.textContent = "✦ Ask Claude Why";
  }
  btn.disabled = false;
}

// ── Trade Analyzer ─────────────────────────────────────────────────────────
let tradeSides = { give: [], receive: [] };

function setupTradeSide(inputId, dropdownId, listId, side) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);

  input.addEventListener("input", function () {
    const q = this.value.toLowerCase().trim();
    if (!q || !allPlayers.length) { dropdown.classList.add("hidden"); return; }

    const already = [...tradeSides.give, ...tradeSides.receive].map(p => p.name);
    const matches = allPlayers
      .filter(p => p.name.toLowerCase().includes(q) && !already.includes(p.name))
      .slice(0, 8);

    if (!matches.length) { dropdown.classList.add("hidden"); return; }

    dropdown.innerHTML = matches.map(p => `
      <li data-name="${p.name}">
        ${headshot(p.player_id, p.name, 28)}
        ${posBadge(p.position)}
        <span>${p.name}</span>
        <span style="color:#94a3b8;font-size:.78rem;margin-left:auto;">${p.team} · ${p.projection.toFixed(1)} pts</span>
      </li>
    `).join("");
    dropdown.classList.remove("hidden");
  });

  dropdown.addEventListener("click", e => {
    const li = e.target.closest("li");
    if (!li) return;
    const player = allPlayers.find(p => p.name === li.dataset.name);
    if (!player) return;
    tradeSides[side].push(player);
    renderTradeList(listId, side);
    input.value = "";
    dropdown.classList.add("hidden");
  });

  document.addEventListener("click", e => {
    if (!input.contains(e.target)) dropdown.classList.add("hidden");
  });
}

function renderTradeList(listId, side) {
  const list = document.getElementById(listId);
  const players = tradeSides[side];
  if (!players.length) {
    list.innerHTML = `<li class="trade-empty">No players added yet.</li>`;
    return;
  }
  list.innerHTML = players.map((p, i) => `
    <li class="trade-player-row">
      ${headshot(p.player_id, p.name, 32)}
      <div class="tpr-info">
        <span class="tpr-name">${p.name}</span>
        <span class="tpr-meta">${posBadge(p.position)} ${p.team} · ${p.projection.toFixed(1)} pts</span>
      </div>
      <button class="remove-btn" onclick="removeTradePlayer('${side}', ${i}, '${listId}')">✕</button>
    </li>
  `).join("");
}

function removeTradePlayer(side, index, listId) {
  tradeSides[side].splice(index, 1);
  renderTradeList(listId, side);
}

setupTradeSide("give-search",    "give-dropdown",    "give-list",    "give");
setupTradeSide("receive-search", "receive-dropdown", "receive-list", "receive");

// Initialize empty lists
renderTradeList("give-list",    "give");
renderTradeList("receive-list", "receive");

document.getElementById("clear-trade-btn").addEventListener("click", () => {
  tradeSides = { give: [], receive: [] };
  renderTradeList("give-list",    "give");
  renderTradeList("receive-list", "receive");
  document.getElementById("trade-result").classList.add("hidden");
});

document.getElementById("analyze-trade-btn").addEventListener("click", async () => {
  const { give, receive } = tradeSides;
  if (!give.length || !receive.length) {
    alert("Add at least one player to each side of the trade.");
    return;
  }

  const btn    = document.getElementById("analyze-trade-btn");
  const result = document.getElementById("trade-result");
  btn.disabled = true;
  btn.textContent = "Analyzing…";
  result.classList.add("hidden");

  const scoring = document.getElementById("trade-scoring").value;

  const toPayload = players => players.map(p => ({
    name: p.name, position: p.position, team: p.team,
    projection: p.projection, rank: p.rank,
  }));

  try {
    const res = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ giving: toPayload(give), receiving: toPayload(receive), scoring }),
    });
    const data = await res.json();

    if (data.error) {
      result.innerHTML = `<p style="color:#ef4444;">${data.error}</p>`;
    } else {
      // Detect verdict keyword for color coding
      const text = data.analysis;
      const verdictClass = /\bwin\b/i.test(text) ? "verdict-win"
                         : /\blose\b|\bloss\b/i.test(text) ? "verdict-lose"
                         : "verdict-fair";
      result.innerHTML = `<div class="trade-analysis ${verdictClass}">${renderMarkdown(text)}</div>`;
    }
    result.classList.remove("hidden");
  } catch (err) {
    result.innerHTML = `<p style="color:#ef4444;">Could not reach Claude. Check API key.</p>`;
    result.classList.remove("hidden");
  }

  btn.disabled = false;
  btn.textContent = "✦ Analyze Trade";
});

// ── Waiver Wire Assistant ──────────────────────────────────────────────────
let waiverSides = { avail: [], roster: [] };

function setupWaiverSide(inputId, dropdownId, listId, side) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);

  input.addEventListener("input", function () {
    const q = this.value.toLowerCase().trim();
    if (!q || !allPlayers.length) { dropdown.classList.add("hidden"); return; }

    const already = [...waiverSides.avail, ...waiverSides.roster].map(p => p.name);
    const matches = allPlayers
      .filter(p => p.name.toLowerCase().includes(q) && !already.includes(p.name))
      .slice(0, 8);

    if (!matches.length) { dropdown.classList.add("hidden"); return; }

    dropdown.innerHTML = matches.map(p => `
      <li data-name="${p.name}">
        ${headshot(p.player_id, p.name, 28)}
        ${posBadge(p.position)}
        <span>${p.name}</span>
        <span style="color:#94a3b8;font-size:.78rem;margin-left:auto;">${p.team} · ${p.projection.toFixed(1)} pts</span>
      </li>
    `).join("");
    dropdown.classList.remove("hidden");
  });

  dropdown.addEventListener("click", e => {
    const li = e.target.closest("li");
    if (!li) return;
    const player = allPlayers.find(p => p.name === li.dataset.name);
    if (!player) return;
    waiverSides[side].push(player);
    renderWaiverList(listId, side);
    input.value = "";
    dropdown.classList.add("hidden");
  });

  document.addEventListener("click", e => {
    if (!input.contains(e.target)) dropdown.classList.add("hidden");
  });
}

function renderWaiverList(listId, side) {
  const list    = document.getElementById(listId);
  const players = waiverSides[side];
  if (!players.length) {
    list.innerHTML = `<li class="trade-empty">No players added yet.</li>`;
    return;
  }
  list.innerHTML = players.map((p, i) => `
    <li class="trade-player-row">
      ${headshot(p.player_id, p.name, 32)}
      <div class="tpr-info">
        <span class="tpr-name">${p.name}</span>
        <span class="tpr-meta">${posBadge(p.position)} ${p.team} · ${p.projection.toFixed(1)} pts</span>
      </div>
      <button class="remove-btn" onclick="removeWaiverPlayer('${side}', ${i}, '${listId}')">✕</button>
    </li>
  `).join("");
}

function removeWaiverPlayer(side, index, listId) {
  waiverSides[side].splice(index, 1);
  renderWaiverList(listId, side);
}

setupWaiverSide("waiver-avail-search",  "waiver-avail-dropdown",  "waiver-avail-list",  "avail");
setupWaiverSide("waiver-roster-search", "waiver-roster-dropdown", "waiver-roster-list", "roster");
renderWaiverList("waiver-avail-list",  "avail");
renderWaiverList("waiver-roster-list", "roster");

document.getElementById("waiver-clear-btn").addEventListener("click", () => {
  waiverSides = { avail: [], roster: [] };
  renderWaiverList("waiver-avail-list",  "avail");
  renderWaiverList("waiver-roster-list", "roster");
  document.getElementById("waiver-result").classList.add("hidden");
});

document.getElementById("waiver-analyze-btn").addEventListener("click", async () => {
  if (!waiverSides.avail.length) {
    alert("Add at least one available player to analyze.");
    return;
  }

  const btn    = document.getElementById("waiver-analyze-btn");
  const result = document.getElementById("waiver-result");
  btn.disabled = true;
  btn.textContent = "Analyzing…";
  result.classList.add("hidden");

  const toPayload = players => players.map(p => ({
    name: p.name, position: p.position, team: p.team,
    projection: p.projection, rank: p.rank,
  }));

  try {
    const res = await fetch("/api/waiver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        available: toPayload(waiverSides.avail),
        roster:    toPayload(waiverSides.roster),
        need:      document.getElementById("waiver-need").value,
        scoring:   document.getElementById("waiver-scoring").value,
      }),
    });
    const data = await res.json();
    result.innerHTML = data.error
      ? `<p style="color:#ef4444;">${data.error}</p>`
      : `<div class="trade-analysis verdict-win">${renderMarkdown(data.analysis)}</div>`;
    result.classList.remove("hidden");
  } catch (err) {
    result.innerHTML = `<p style="color:#ef4444;">Could not reach Claude. Check API key.</p>`;
    result.classList.remove("hidden");
  }

  btn.disabled = false;
  btn.textContent = "✦ Get Recommendations";
});

// ── Injury Report ─────────────────────────────────────────────────────────
document.querySelector('[data-tab="news"]').addEventListener("click", loadNews);

async function loadNews() {
  const injuryEl = document.getElementById("injury-list");
  injuryEl.innerHTML = `<div class="loading">Loading...</div>`;
  try {
    const res  = await fetch("/api/news");
    const data = await res.json();
    if (!data.injured || !data.injured.length) {
      injuryEl.innerHTML = `<p class="subtext">No injury designations found for this week.</p>`;
    } else {
      injuryEl.innerHTML = data.injured.map(p => `
        <div class="news-row">
          ${headshot(p.player_id, p.name, 36)}
          <div class="news-info">
            <span class="news-name">${p.name}</span>
            <span class="news-meta">${posBadge(p.position)} ${p.team}</span>
          </div>
          <span class="inj-tag">${p.injury_status}</span>
        </div>
      `).join("");
    }
  } catch (err) {
    injuryEl.innerHTML = `<p style="color:#ef4444;">Error loading injury data.</p>`;
  }
}

// ── Trending Adds (Waiver Wire tab) ───────────────────────────────────────
let _trendingLoaded = false;
document.querySelector('[data-tab="waiver"]').addEventListener("click", () => {
  if (!_trendingLoaded) loadTrending();
});

async function loadTrending() {
  const trendEl = document.getElementById("trending-list");
  if (!trendEl) return;
  trendEl.innerHTML = `<div class="loading">Loading...</div>`;
  try {
    const res  = await fetch("/api/news");
    const data = await res.json();
    if (!data.trending || !data.trending.length) {
      trendEl.innerHTML = `<p class="subtext">Trending data unavailable (off-season or API limit).</p>`;
    } else {
      _trendingLoaded = true;
      trendEl.innerHTML = data.trending.map((p, i) => `
        <div class="news-row">
          <span class="trend-rank">${i + 1}</span>
          ${headshot(p.player_id, p.name, 36)}
          <div class="news-info">
            <span class="news-name">${p.name}</span>
            <span class="news-meta">${posBadge(p.position)} ${p.team}</span>
          </div>
          <span class="trend-count">+${p.add_count.toLocaleString()}</span>
        </div>
      `).join("");
    }
  } catch (err) {
    trendEl.innerHTML = `<p style="color:#ef4444;">Error loading trending data.</p>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BYE WEEK CALENDAR
// ═══════════════════════════════════════════════════════════════════════════

// 2025 bye weeks — fallback if Sleeper hasn't released the upcoming season yet
const _BYE_FALLBACK = {
  season: "2025",
  byes: {
    ARI: 11, ATL: 12, BAL: 14, BUF: 12, CAR: 11, CHI: 7,
    CIN: 12, CLE: 10, DAL: 7,  DEN: 14, DET: 5,  GB: 6,
    HOU: 14, IND: 14, JAX: 12, KC: 6,  LAC: 5,  LAR: 6,
    LV: 10,  MIA: 6,  MIN: 6,  NE: 14, NO: 12,  NYG: 11,
    NYJ: 12, PHI: 5,  PIT: 9,  SEA: 9,  SF: 9,  TB: 11,
    TEN: 5,  WAS: 14,
  },
};

const NFL_DIVISIONS = {
  "AFC East":  ["BUF","MIA","NE","NYJ"],
  "AFC North": ["BAL","CIN","CLE","PIT"],
  "AFC South": ["HOU","IND","JAX","TEN"],
  "AFC West":  ["DEN","KC","LV","LAC"],
  "NFC East":  ["DAL","NYG","PHI","WAS"],
  "NFC North": ["CHI","DET","GB","MIN"],
  "NFC South": ["ATL","CAR","NO","TB"],
  "NFC West":  ["ARI","LAR","SF","SEA"],
};

document.querySelector('[data-tab="bye"]').addEventListener("click", renderByeCalendar);

async function renderByeCalendar() {
  const thead = document.getElementById("bye-thead");
  const tbody = document.getElementById("bye-tbody");
  if (!thead || !tbody || tbody.dataset.rendered) return;
  tbody.dataset.rendered = "1";

  // Fetch live bye weeks from Sleeper cache; fall back to 2025 hardcoded
  let byeData = _BYE_FALLBACK;
  try {
    const res = await fetch("/api/bye_weeks");
    if (res.ok) {
      const data = await res.json();
      if (data.byes && Object.keys(data.byes).length >= 28) {
        byeData = data; // live data has all 32 teams
      }
    }
  } catch (_) {}

  const { season, byes } = byeData;

  // Update tab heading to show the season
  const heading = document.querySelector("#tab-bye h2");
  if (heading) heading.textContent = `${season} Bye Week Calendar`;

  const badgeText   = (document.getElementById("week-badge") || {}).textContent || "";
  const weekMatch   = badgeText.match(/Week\s*(\d+)/i);
  const currentWeek = weekMatch ? parseInt(weekMatch[1]) : 18;

  const weeks = Array.from({length: 18}, (_, i) => i + 1);

  thead.innerHTML = `<tr>
    <th class="bye-th-team">Team</th>
    ${weeks.map(w => `<th${w === currentWeek ? ' style="color:var(--accent);"' : ""}>${w}</th>`).join("")}
  </tr>`;

  const rows = [];
  for (const [div, teams] of Object.entries(NFL_DIVISIONS)) {
    rows.push(`<tr>
      <td colspan="${weeks.length + 1}" style="background:var(--surface2);color:var(--text-2);font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:.3rem .75rem;">${div}</td>
    </tr>`);
    for (const team of teams) {
      const byeWk = byes[team];
      const cells = weeks.map(w => {
        if (w === byeWk)        return `<td><span class="bye-cell-bye">BYE</span></td>`;
        if (w < currentWeek)   return `<td class="bye-cell-past">·</td>`;
        if (w === currentWeek) return `<td class="bye-cell-current">▶</td>`;
        return `<td class="bye-cell-normal">·</td>`;
      }).join("");
      const logo = `<img src="https://a.espncdn.com/i/teamlogos/nfl/500/${team.toLowerCase()}.png"
        style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin-right:.4rem;border-radius:3px;"
        onerror="this.style.display='none'" loading="lazy"/>`;
      rows.push(`<tr>
        <td class="bye-td-team">${logo}${team}</td>
        ${cells}
      </tr>`);
    }
  }
  tbody.innerHTML = rows.join("");
}

// ── D/ST settings UI + init ────────────────────────────────────────────────
buildDstSettingsUI();
renderRosterList();
loadRankings();

// ═══════════════════════════════════════════════════════════════════════════
// GAME LOG TAB
// ═══════════════════════════════════════════════════════════════════════════

let glPlayer  = null;   // { name, player_id, position, team }
let glSeasons = "2025"; // comma-separated string for API

// ── Search ─────────────────────────────────────────────────────────────────
const glSearchInput = document.getElementById("gl-search");
const glDropdown    = document.getElementById("gl-dropdown");

glSearchInput.addEventListener("input", function () {
  const q = this.value.toLowerCase().trim();
  if (q.length < 2) { glDropdown.classList.add("hidden"); return; }

  const pool = (allRosterPlayers.length ? allRosterPlayers : allPlayers)
    .filter(p => p.position !== "DEF"); // DEF game logs not supported

  const matches = pool
    .filter(p => p.name.toLowerCase().includes(q))
    .slice(0, 9);

  if (!matches.length) { glDropdown.classList.add("hidden"); return; }

  glDropdown.innerHTML = matches.map(p => `
    <li data-name="${p.name}"
        data-id="${p.player_id || ''}"
        data-pos="${p.position}"
        data-team="${p.team || ''}">
      ${headshot(p.player_id, p.name, 26)}
      <span style="flex:1;">${p.name}</span>
      ${posBadge(p.position)}
      <span class="gl-dim" style="font-size:.76rem;">${p.team || ''}</span>
    </li>
  `).join("");
  glDropdown.classList.remove("hidden");
});

glDropdown.addEventListener("click", e => {
  const li = e.target.closest("li");
  if (!li) return;
  glPlayer = {
    name:      li.dataset.name,
    player_id: li.dataset.id,
    position:  li.dataset.pos,
    team:      li.dataset.team,
  };
  glSearchInput.value = li.dataset.name;
  glDropdown.classList.add("hidden");
  _fetchGameLog();
});

document.addEventListener("click", e => {
  if (!glDropdown.contains(e.target) && e.target !== glSearchInput)
    glDropdown.classList.add("hidden");
});

// ── Season toggle ───────────────────────────────────────────────────────────
document.querySelectorAll(".gl-season-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".gl-season-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    glSeasons = btn.dataset.seasons;
    if (glPlayer) _fetchGameLog();
  });
});

// ── Fetch ───────────────────────────────────────────────────────────────────
async function _fetchGameLog() {
  if (!glPlayer?.player_id) return;

  // Show player header
  document.getElementById("gl-player-header").innerHTML = `
    ${headshot(glPlayer.player_id, glPlayer.name, 48)}
    <div class="gl-ph-info">
      <span class="gl-ph-name">${glPlayer.name}</span>
      <div class="gl-ph-meta">${posBadge(glPlayer.position)}<span>${glPlayer.team}</span></div>
    </div>
  `;
  document.getElementById("gl-player-header").classList.remove("hidden");
  document.getElementById("gl-loading").classList.remove("hidden");
  document.getElementById("gl-table-wrap").style.display = "none";
  document.getElementById("gl-error").classList.add("hidden");

  try {
    const url = `/api/player_history?player_id=${encodeURIComponent(glPlayer.player_id)}`
              + `&position=${glPlayer.position}`
              + `&seasons=${encodeURIComponent(glSeasons)}`;
    const res  = await fetch(url);
    const data = await res.json();
    document.getElementById("gl-loading").classList.add("hidden");

    if (data.error) {
      const el = document.getElementById("gl-error");
      el.textContent = data.error;
      el.classList.remove("hidden");
      return;
    }
    _renderGameLog(data.games || [], glPlayer.position);
  } catch {
    document.getElementById("gl-loading").classList.add("hidden");
    const el = document.getElementById("gl-error");
    el.textContent = "Failed to load game log. Please try again.";
    el.classList.remove("hidden");
  }
}

// ── Column definitions ──────────────────────────────────────────────────────
function _glCols(pos) {
  if (pos === "QB")
    return ["Wk","Date","Opponent","CMP/ATT","CMP%","PASS YDS","TD","INT","RUSH ATT","RUSH YDS","Weather","FPTS"];
  if (pos === "RB")
    return ["Wk","Date","Opponent","CAR","RUSH YDS","YPC","RUSH TD","TGT","REC","REC YDS","REC TD","Weather","FPTS"];
  if (pos === "WR" || pos === "TE")
    return ["Wk","Date","Opponent","TGT","REC","REC%","REC YDS","YPR","REC TD","YAC","Weather","FPTS"];
  if (pos === "K")
    return ["Wk","Date","Opponent","FGM/FGA","FG%","LONG","XPM/XPA","20-29","30-39","40-49","50+","Weather","FPTS"];
  return ["Wk","Date","Opponent","Weather","FPTS"];
}

function _glStatCells(game, pos) {
  const s = game.stats;
  const good = v => `<td class="gl-good">${v}</td>`;
  const bad  = v => `<td class="gl-bad">${v}</td>`;
  const dim  = v => `<td class="gl-dim">${v}</td>`;
  const td   = v => `<td>${v}</td>`;

  if (pos === "QB") {
    const cmpPct = s.att ? Math.round((s.cmp / s.att) * 100) : 0;
    return [
      td(`${s.cmp}/${s.att}`),
      cmpPct >= 65 ? good(`${cmpPct}%`) : cmpPct < 55 ? bad(`${cmpPct}%`) : td(`${cmpPct}%`),
      s.pass_yd >= 300 ? good(s.pass_yd) : td(s.pass_yd),
      s.pass_td >= 3   ? good(s.pass_td) : td(s.pass_td),
      s.int    >= 2    ? bad(s.int)      : td(s.int),
      dim(s.rush_att),
      dim(s.rush_yd),
    ].join("");
  }
  if (pos === "RB") {
    const ypc = s.rush_att ? (s.rush_yd / s.rush_att).toFixed(1) : "—";
    return [
      td(s.rush_att),
      s.rush_yd >= 100 ? good(s.rush_yd) : s.rush_yd < 30 ? bad(s.rush_yd) : td(s.rush_yd),
      td(ypc),
      s.rush_td >= 1 ? good(s.rush_td) : td(s.rush_td),
      dim(s.tgt),
      dim(s.rec),
      dim(s.rec_yd),
      dim(s.rec_td),
    ].join("");
  }
  if (pos === "WR" || pos === "TE") {
    const recPct = s.tgt ? Math.round((s.rec  / s.tgt)   * 100) : 0;
    const ypr    = s.rec  ? Math.round( s.rec_yd / s.rec)       : 0;
    return [
      td(s.tgt),
      td(s.rec),
      recPct >= 70 ? good(`${recPct}%`) : recPct < 40 ? bad(`${recPct}%`) : td(`${recPct}%`),
      s.rec_yd >= 100 ? good(s.rec_yd) : s.rec_yd < 20 ? bad(s.rec_yd) : td(s.rec_yd),
      td(ypr || "—"),
      s.rec_td >= 1 ? good(s.rec_td) : dim(s.rec_td),
      dim(s.yac || "—"),
    ].join("");
  }
  if (pos === "K") {
    const fgPct = s.fga ? Math.round((s.fgm / s.fga) * 100) : 0;
    return [
      td(`${s.fgm}/${s.fga}`),
      fgPct === 100 ? good(`${fgPct}%`) : fgPct < 60 ? bad(`${fgPct}%`) : td(`${fgPct}%`),
      td(s.fg_lng || "—"),
      td(`${s.xpm}/${s.xpa}`),
      dim(s.fg_20_29 || "—"),
      dim(s.fg_30_39 || "—"),
      dim(s.fg_40_49 || "—"),
      dim(s.fg_50p   || "—"),
    ].join("");
  }
  return "";
}

function _glWeatherCell(w) {
  if (!w) return `<td class="gl-dim">—</td>`;
  if (w.indoor) return `<td><span class="weather-badge dome">🏟 Dome</span></td>`;
  const c = (w.condition || "").toLowerCase();
  let icon = "🌤";
  if (c.includes("thunder"))                       icon = "⛈";
  else if (c.includes("snow"))                     icon = "❄️";
  else if (c.includes("rain")||c.includes("show")||c.includes("driz")) icon = "🌧";
  else if (c.includes("fog"))                      icon = "🌫";
  else if (c === "clear")                          icon = "☀️";
  else if (c === "cloudy")                         icon = "☁️";
  const bad = w.wind_mph >= 20 || (w.precip_in||0) > 0.1 || (w.temp_f||99) <= 32;
  const cls = bad ? "weather-badge bad" : "weather-badge ok";
  let label = `${icon} ${w.temp_f ?? "?"}°F`;
  if (w.wind_mph >= 15) label += ` · ${w.wind_mph}mph`;
  const tip = `${w.condition} · ${w.temp_f}°F · Wind ${w.wind_mph}mph · ${w.precip_in}" precip`;
  return `<td><span class="${cls}" title="${tip}">${label}</span></td>`;
}

function _glFmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Averages footer ─────────────────────────────────────────────────────────
function _glAvgRow(games, pos, numCols) {
  if (!games.length) return "";
  const n   = games.length;
  const avg = key => games.reduce((s, g) => s + (g.stats[key] || 0), 0) / n;
  const f1  = key => avg(key).toFixed(1);
  const f0  = key => avg(key).toFixed(0);

  let cells = "";
  if (pos === "QB") {
    const cmpPct = avg("att") > 0 ? Math.round((avg("cmp") / avg("att")) * 100) : 0;
    cells = `<td>${f1("cmp")}/${f1("att")}</td><td>${cmpPct}%</td><td>${f0("pass_yd")}</td>
             <td>${f1("pass_td")}</td><td>${f1("int")}</td>
             <td>${f1("rush_att")}</td><td>${f0("rush_yd")}</td>`;
  } else if (pos === "RB") {
    const ypc = avg("rush_att") > 0 ? (avg("rush_yd") / avg("rush_att")).toFixed(1) : "—";
    cells = `<td>${f1("rush_att")}</td><td>${f0("rush_yd")}</td><td>${ypc}</td>
             <td>${f1("rush_td")}</td><td>${f1("tgt")}</td>
             <td>${f1("rec")}</td><td>${f0("rec_yd")}</td><td>${f1("rec_td")}</td>`;
  } else if (pos === "WR" || pos === "TE") {
    const recPct = avg("tgt") > 0 ? Math.round((avg("rec") / avg("tgt")) * 100) : 0;
    const ypr    = avg("rec") > 0  ? Math.round(avg("rec_yd") / avg("rec"))     : 0;
    cells = `<td>${f1("tgt")}</td><td>${f1("rec")}</td><td>${recPct}%</td>
             <td>${f0("rec_yd")}</td><td>${ypr}</td>
             <td>${f1("rec_td")}</td><td>${f0("yac")}</td>`;
  } else if (pos === "K") {
    const fgPct = avg("fga") > 0 ? Math.round((avg("fgm") / avg("fga")) * 100) : 0;
    cells = `<td>${f1("fgm")}/${f1("fga")}</td><td>${fgPct}%</td><td>—</td>
             <td>${f1("xpm")}/${f1("xpa")}</td>
             <td>—</td><td>—</td><td>—</td><td>—</td>`;
  }

  const avgPts = (games.reduce((s, g) => s + g.pts_ppr, 0) / n).toFixed(1);
  return `<tr class="gl-avg-row">
    <td colspan="3">${n} games · Season avg</td>
    ${cells}
    <td>—</td>
    <td class="gl-fpts">${avgPts}</td>
  </tr>`;
}

// ── Render ──────────────────────────────────────────────────────────────────
function _renderGameLog(games, pos) {
  const tableWrap = document.getElementById("gl-table-wrap");
  const thead     = document.getElementById("gl-thead");
  const tbody     = document.getElementById("gl-tbody");
  const tfoot     = document.getElementById("gl-tfoot");
  const errorEl   = document.getElementById("gl-error");

  if (!games.length) {
    errorEl.textContent = "No game data found. Player may not have stats for the selected season(s).";
    errorEl.classList.remove("hidden");
    tableWrap.style.display = "none";
    return;
  }

  errorEl.classList.add("hidden");
  tableWrap.style.display = "";

  const cols = _glCols(pos);
  thead.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;

  const ptsArr = games.map(g => g.pts_ppr);
  const avgPts = ptsArr.reduce((a, b) => a + b, 0) / ptsArr.length;

  let lastSeason = null;
  const rows = [];

  games.forEach(game => {
    if (game.season !== lastSeason) {
      rows.push(`<tr class="gl-season-row">
        <td colspan="${cols.length}"><span>${game.season} Regular Season</span></td>
      </tr>`);
      lastSeason = game.season;
    }

    let rowCls = "";
    if      (game.pts_ppr >= avgPts * 1.45) rowCls = "gl-row-elite";
    else if (game.pts_ppr >= avgPts * 1.15) rowCls = "gl-row-good";
    else if (game.pts_ppr <  avgPts * 0.55) rowCls = "gl-row-poor";

    let oppCell;
    if (game.opponent && game.opponent !== "TBD") {
      const prefix = game.home === true  ? `<span class="gl-home-tag">vs</span>`
                   : game.home === false ? `<span class="gl-away-tag">@</span>`
                   : ``;
      oppCell = `${prefix}&nbsp;<strong>${game.opponent}</strong>`;
    } else {
      oppCell = `<span class="gl-dim">—</span>`;
    }

    rows.push(`<tr class="${rowCls}">
      <td class="gl-dim">Wk&nbsp;${game.week}</td>
      <td class="gl-dim">${_glFmtDate(game.date)}</td>
      <td class="gl-matchup">${oppCell}</td>
      ${_glStatCells(game, pos)}
      ${_glWeatherCell(game.weather)}
      <td class="gl-fpts">${game.pts_ppr.toFixed(1)}</td>
    </tr>`);
  });

  tbody.innerHTML = rows.join("");
  tfoot.innerHTML = _glAvgRow(games, pos, cols.length);
}
