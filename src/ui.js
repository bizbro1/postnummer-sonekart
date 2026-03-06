import { allPostnrs, zoomToPostnr, applyStyle, repaintAll } from "./map.js";
import { postnrMap } from "./constants.js";
import { zones, routes, activeTab, setActiveTab, persist, getManager } from "./state.js";
import { exportJSON, exportCSV, importJSONFile } from "./export.js";

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

export function initUI() {
  initTabs();
  initSonerEvents();
  initRuterEvents();
}

export function refreshUI() {
  if (activeTab === "soner") refreshSonerUI();
  else refreshRuterUI();
}

// ─── Tabs ───────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveTab(btn.dataset.tab);
      syncTabUI();
      repaintAll();
      refreshUI();
      persist();
    });
  });
}

export function syncTabUI() {
  document.querySelectorAll(".nav-tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === activeTab)
  );
  document.querySelectorAll(".tab-content").forEach((el) =>
    el.classList.toggle("active", el.id === "tab-" + activeTab)
  );
}

// ─── Generic renderers ──────────────────────────────────────────

function renderSelect(selectId, mgr) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = "";
  for (const name of Object.keys(mgr.groups)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name + " (" + mgr.groups[name].length + ")";
    if (name === mgr.active) opt.selected = true;
    sel.appendChild(opt);
  }
}

function renderStatusBar(totalId, perId, mgr) {
  document.getElementById(totalId).textContent = "Totalt valgt: " + mgr.totalSelected();
  const perEl = document.getElementById(perId);
  perEl.innerHTML = "";
  for (const [name, list] of Object.entries(mgr.groups)) {
    const span = document.createElement("span");
    span.className = "status-zone-item";
    span.innerHTML =
      '<span class="status-zone-dot" style="background:' + mgr.color(name) + '"></span>' +
      name + ": " + list.length;
    perEl.appendChild(span);
  }
}

function renderLists(containerId, mgr, emptyText) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  for (const [name, list] of Object.entries(mgr.groups)) {
    const block = document.createElement("div");
    block.className = "zone-block";
    const header = document.createElement("div");
    header.className = "zone-block-header";
    header.innerHTML =
      '<span class="zone-dot" style="background:' + mgr.color(name) + '"></span>' +
      name + " (" + list.length + ")";
    block.appendChild(header);
    const body = document.createElement("div");
    body.className = "zone-block-body";
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "zone-block-empty";
      empty.textContent = emptyText;
      body.appendChild(empty);
    } else {
      for (const pnr of [...list].sort()) {
        const entry = document.createElement("div");
        entry.className = "zone-entry";
        const info = postnrMap.get(pnr);
        const label = pnr + (info && info.poststed ? " – " + info.poststed : "");
        entry.innerHTML =
          '<span class="zone-entry-label">' + label + "</span>" +
          '<button title="Fjern">&times;</button>';
        entry.querySelector("button").addEventListener("click", () => {
          mgr.remove(pnr);
          applyStyle(pnr);
          persist();
          refreshUI();
        });
        entry.querySelector(".zone-entry-label").style.cursor = "pointer";
        entry.querySelector(".zone-entry-label").addEventListener("click", () => zoomToPostnr(pnr));
        body.appendChild(entry);
      }
    }
    block.appendChild(body);
    container.appendChild(block);
  }
}

function setupSearch(inputId, resultsId, mgr) {
  const input = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  const doSearch = debounce(() => {
    const q = input.value.trim().toLowerCase();
    results.innerHTML = "";
    if (q.length < 2) return;
    const matches = allPostnrs
      .filter((a) => a.postnr.includes(q) || a.poststed.toLowerCase().includes(q))
      .slice(0, 50);
    for (const m of matches) {
      const div = document.createElement("div");
      div.className = "search-result-item";
      div.textContent = m.postnr + (m.poststed ? " – " + m.poststed : "");
      const g = mgr.lookup[m.postnr];
      if (g) div.style.borderLeft = "3px solid " + mgr.color(g);
      div.addEventListener("click", () => zoomToPostnr(m.postnr));
      results.appendChild(div);
    }
  }, 180);
  input.addEventListener("input", doSearch);
}

// ─── Soner ──────────────────────────────────────────────────────

function refreshSonerUI() {
  renderSelect("zone-select", zones);
  renderLists("zone-lists", zones, "Ingen postnummer valgt");
  renderStatusBar("status-total-soner", "status-per-soner", zones);
  document.getElementById("zone-color-swatch").style.background = zones.activeColor();
}

function initSonerEvents() {
  document.getElementById("zone-select").addEventListener("change", function () {
    zones.active = this.value;
    persist(); refreshSonerUI();
  });
  document.getElementById("btn-add-zone").addEventListener("click", () => {
    zones.addGroup(); persist(); refreshUI();
  });
  document.getElementById("btn-remove-zone").addEventListener("click", () => {
    for (const pnr of zones.removeGroup()) applyStyle(pnr);
    persist(); refreshUI();
  });
  document.getElementById("btn-clear-soner").addEventListener("click", () => {
    for (const pnr of zones.clearAll()) applyStyle(pnr);
    persist(); refreshUI();
  });
  setupSearch("search-input-soner", "search-results-soner", zones);
  document.getElementById("btn-export-json-soner").addEventListener("click", () =>
    exportJSON(zones.groups, "postnummer_soner.json"));
  document.getElementById("btn-export-csv-soner").addEventListener("click", () =>
    exportCSV(zones.groups, "postnummer_soner.csv"));
  document.getElementById("file-import-soner").addEventListener("change", function () {
    importJSONFile(this, zones, () => { repaintAll(); persist(); refreshUI(); });
  });
}

// ─── Ruter ──────────────────────────────────────────────────────

function refreshRuterUI() {
  renderSelect("route-select", routes);
  renderLists("route-lists", routes, "Ingen postnummer i ruten");
  renderStatusBar("status-total-ruter", "status-per-ruter", routes);
  document.getElementById("route-color-swatch").style.background = routes.activeColor();
  document.getElementById("route-name-input").value = routes.active;
}

function initRuterEvents() {
  document.getElementById("route-select").addEventListener("change", function () {
    routes.active = this.value;
    persist(); refreshRuterUI();
  });
  document.getElementById("btn-add-route").addEventListener("click", () => {
    routes.addGroup(); persist(); refreshUI();
  });
  document.getElementById("btn-remove-route").addEventListener("click", () => {
    for (const pnr of routes.removeGroup()) applyStyle(pnr);
    persist(); refreshUI();
  });
  document.getElementById("btn-rename-route").addEventListener("click", () => {
    const newName = document.getElementById("route-name-input").value.trim();
    if (routes.renameGroup(newName)) { repaintAll(); persist(); refreshUI(); }
    else if (newName && routes.groups[newName]) alert("Navnet er allerede i bruk.");
  });
  document.getElementById("btn-clear-ruter").addEventListener("click", () => {
    for (const pnr of routes.clearAll()) applyStyle(pnr);
    persist(); refreshUI();
  });
  setupSearch("search-input-ruter", "search-results-ruter", routes);
  document.getElementById("btn-export-json-ruter").addEventListener("click", () =>
    exportJSON(routes.groups, "postnummer_ruter.json"));
  document.getElementById("btn-export-csv-ruter").addEventListener("click", () =>
    exportCSV(routes.groups, "postnummer_ruter.csv"));
  document.getElementById("file-import-ruter").addEventListener("change", function () {
    importJSONFile(this, routes, () => { repaintAll(); persist(); refreshUI(); });
  });
}
