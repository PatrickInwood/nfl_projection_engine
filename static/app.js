// ── NFL Projection Engine — Frontend Logic ─────────────────────────────────
// All player data is fetched once and stored in `allPlayers` for instant
// filtering, search, and roster building without extra API calls.

let allPlayers = [];   // full ranked list (current scoring format)
let currentScoring = "ppr";
let myRoster = [];     // names added to roster builder

const POS_COLORS = { QB:"pos-QB", RB:"pos-RB", WR:"pos-WR", TE:"pos-TE", K:"pos-K", DEF:"pos-DEF" };

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
function posBadge(pos) {
  const cls = POS_COLORS[pos] || "";
  return `<span class="pos-badge ${cls}">${pos}</span>`;
}

function injTag(status) {
  if (!status || status.toLowerCase() === "active") return "";
  return `<span class="inj-tag">${status}</span>`;
}

// ── Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ── Load & render rankings ─────────────────────────────────────────────────
async function loadRankings() {
  const scoring  = document.getElementById("scoring-select").value;
  const pos      = document.querySelector(".pos-btn.active")?.dataset.pos || "ALL";
  const hideBye  = document.getElementById("hide-bye").checked;
  currentScoring = scoring;

  const url = `/api/players?scoring=${scoring}&position=${pos}&hide_bye=${hideBye}`;
  const res = await fetch(url);
  const data = await res.json();

  allPlayers = data.players;  // cache for roster builder and search

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
  tbody.innerHTML = players.map((p, i) => `
    <tr>
      <td style="color:#94a3b8;font-weight:600;">${p.rank ?? i+1}</td>
      <td>
        <div style="display:flex;align-items:center;gap:.5rem;">
          ${headshot(p.player_id, p.name)}
          <strong>${p.name}</strong>
        </div>
      </td>
      <td>${posBadge(p.position)}</td>
      <td style="color:#64748b;">${p.team}</td>
      <td style="color:#64748b;font-size:.82rem;">${p.opponent || "TBD"}</td>
      <td class="pts">${p.projection.toFixed(2)}</td>
      <td>${injTag(p.injury_status)}</td>
    </tr>
  `).join("");
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
  tbody.innerHTML = data.dst.map(d => `
    <tr>
      <td style="color:#94a3b8;font-weight:600;">${d.rank}</td>
      <td><strong>${d.name}</strong></td>
      <td>${posBadge("DEF")}</td>
      <td class="pts">${d.projection.toFixed(2)}</td>
    </tr>
  `).join("");
}

document.getElementById("dst-recalc-btn").addEventListener("click", loadDst);

// Load D/ST when tab is clicked
document.querySelector('[data-tab="dst"]').addEventListener("click", () => {
  loadDst();
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
  document.getElementById("slot-qb").value   = 1;
  document.getElementById("slot-rb").value   = 2;
  document.getElementById("slot-wr").value   = 2;
  document.getElementById("slot-te").value   = 1;
  document.getElementById("slot-flex").value = 3;
  document.getElementById("slot-k").value    = 1;
  document.getElementById("slot-dst").value  = 1;
  document.getElementById("roster-scoring").value = "ppr";
  document.querySelectorAll(".flex-pos-cb").forEach(cb => cb.checked = true);
});

// Roster player search dropdown
const rosterSearch = document.getElementById("roster-search");
const rosterDropdown = document.getElementById("roster-dropdown");

rosterSearch.addEventListener("input", function () {
  const q = this.value.toLowerCase().trim();
  if (!q || !allPlayers.length) { rosterDropdown.classList.add("hidden"); return; }

  const matches = allPlayers
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
  const list = document.getElementById("my-roster-list");
  if (!myRoster.length) {
    list.innerHTML = `<li style="color:#94a3b8;font-size:.83rem;padding:.5rem 0;">No players added yet.</li>`;
    return;
  }
  list.innerHTML = myRoster.map(name => {
    const p = allPlayers.find(x => x.name === name);
    return `<li>
      <span>${p ? posBadge(p.position) : ""} ${name}</span>
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
      box.textContent = data.analysis;
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
      result.innerHTML = `<div class="trade-analysis ${verdictClass}">${text}</div>`;
    }
    result.classList.remove("hidden");
  } catch (err) {
    result.innerHTML = `<p style="color:#ef4444;">Could not reach Claude. Check API key.</p>`;
    result.classList.remove("hidden");
  }

  btn.disabled = false;
  btn.textContent = "✦ Analyze Trade";
});

// ── D/ST settings UI + init ────────────────────────────────────────────────
buildDstSettingsUI();
renderRosterList();
loadRankings();
