(function () {
  "use strict";

  // ─── Proj4 definition for EPSG:25833 (UTM zone 33N) ─────────────
  proj4.defs("EPSG:25833", "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
  const toWGS84 = proj4("EPSG:25833", "EPSG:4326");

  const ZONE_COLORS = [
    "#2980b9", "#27ae60", "#e67e22", "#8e44ad", "#c0392b",
    "#16a085", "#d35400", "#2c3e50", "#f39c12", "#1abc9c",
    "#9b59b6", "#e74c3c", "#3498db", "#2ecc71", "#e84393",
    "#00b894", "#6c5ce7", "#fdcb6e", "#0984e3", "#636e72",
  ];

  const ROUTE_COLORS = [
    "#e74c3c", "#f39c12", "#1abc9c", "#9b59b6", "#2980b9",
    "#d35400", "#27ae60", "#e84393", "#00b894", "#6c5ce7",
    "#636e72", "#0984e3", "#fdcb6e", "#c0392b", "#16a085",
    "#8e44ad", "#3498db", "#2ecc71", "#e67e22", "#2c3e50",
  ];

  const POSTNR_KEYS = [
    "postnummer", "POSTNUMMER", "postnr", "POSTNR",
    "postNummer", "PostNummer", "Postnummer",
    "postalcode", "postal_code", "POSTAL_CODE",
    "postkode", "POSTKODE", "zipcode", "zip",
  ];
  const POSTSTED_KEYS = [
    "poststed", "POSTSTED", "postSted", "PostSted", "Poststed",
    "postalname", "postal_name", "POSTAL_NAME",
    "poststedsnavn", "POSTSTEDSNAVN",
    "navn", "NAVN", "name", "NAME",
  ];

  function findAttr(props, candidates) {
    for (const key of candidates) {
      if (props[key] !== undefined && props[key] !== null) return String(props[key]);
    }
    return null;
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getCentroid(layer) {
    const c = layer.getBounds().getCenter();
    return { lat: c.lat, lng: c.lng };
  }

  // ─── Shared map state ───────────────────────────────────────────
  let geoLayer = null;
  let featureIndex = {};       // postnr -> leaflet layer
  let allPostnrs = [];         // [{postnr, poststed, layer}]
  let activeTab = "soner";     // "soner" | "ruter"

  // ─── Soner state ───────────────────────────────────────────────
  let zones = { "Sone 1": [] };
  let activeZone = "Sone 1";
  let postnrToZone = {};

  // ─── Ruter state ───────────────────────────────────────────────
  let routes = { "Rute 1": [] };
  let activeRoute = "Rute 1";
  let postnrToRoute = {};

  // ─── Map setup ─────────────────────────────────────────────────
  const map = L.map("map", { zoomControl: true }).setView([64.5, 14.0], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // ─── Styling helpers ──────────────────────────────────────────
  const DEFAULT_STYLE = {
    color: "#3388ff", weight: 1, opacity: 0.6,
    fillColor: "#3388ff", fillOpacity: 0.10,
  };

  function groupColor(groupName, colorPalette, groupObj) {
    const idx = Object.keys(groupObj).indexOf(groupName);
    return colorPalette[((idx % colorPalette.length) + colorPalette.length) % colorPalette.length];
  }

  function selectedStyle(color) {
    return { color: color, weight: 2.5, opacity: 0.9, fillColor: color, fillOpacity: 0.45 };
  }

  function applyStyle(layer, postnr) {
    if (activeTab === "soner" && postnrToZone[postnr]) {
      const c = groupColor(postnrToZone[postnr], ZONE_COLORS, zones);
      layer.setStyle(selectedStyle(c));
    } else if (activeTab === "ruter" && postnrToRoute[postnr]) {
      const c = groupColor(postnrToRoute[postnr], ROUTE_COLORS, routes);
      layer.setStyle(selectedStyle(c));
    } else {
      layer.setStyle(DEFAULT_STYLE);
    }
  }

  function repaintAll() {
    for (const item of allPostnrs) {
      applyStyle(item.layer, item.postnr);
    }
  }

  // ─── Loading overlay ──────────────────────────────────────────
  const loadingOverlay = document.getElementById("loading-overlay");
  const loadingText = document.getElementById("loading-text");

  function hideLoading() {
    loadingOverlay.classList.add("hidden");
    setTimeout(() => { loadingOverlay.style.display = "none"; }, 500);
  }

  function setLoadingText(msg) { loadingText.textContent = msg; }

  // ─── Reproject / extract helpers ──────────────────────────────
  function reprojectCoords(coords) {
    if (typeof coords[0] === "number") {
      const [lng, lat] = toWGS84.forward(coords);
      coords[0] = lng;
      coords[1] = lat;
    } else {
      for (let i = 0; i < coords.length; i++) reprojectCoords(coords[i]);
    }
  }

  function extractFeatureCollection(data) {
    if (data.type === "FeatureCollection") return data;
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (val && typeof val === "object" && val.type === "FeatureCollection") return val;
    }
    return data;
  }

  function isUTMCoordinates(geojson) {
    try {
      const c = geojson.features[0].geometry.coordinates;
      const flat = flattenOneCoord(c);
      return flat && (Math.abs(flat[0]) > 180 || Math.abs(flat[1]) > 180);
    } catch (_) { return false; }
  }

  function flattenOneCoord(c) {
    return typeof c[0] === "number" ? c : flattenOneCoord(c[0]);
  }

  // ─── Load GeoJSON ─────────────────────────────────────────────
  setLoadingText("Laster postnummerområder...");

  fetch("./data/postnummeromrader.geojson")
    .then((r) => {
      if (!r.ok) throw new Error("Kunne ikke laste GeoJSON-filen.");
      setLoadingText("Parser GeoJSON...");
      return r.json();
    })
    .then((rawData) => {
      setLoadingText("Reprojiserer koordinater (UTM -> WGS84)...");
      const geojson = extractFeatureCollection(rawData);
      const needsReproject =
        (rawData.crs && rawData.crs.properties && rawData.crs.properties.name === "EPSG:25833") ||
        (geojson.crs && geojson.crs.properties && geojson.crs.properties.name === "EPSG:25833") ||
        isUTMCoordinates(geojson);
      if (needsReproject) {
        for (const f of geojson.features) {
          if (f.geometry && f.geometry.coordinates) reprojectCoords(f.geometry.coordinates);
        }
      }
      setLoadingText("Tegner polygoner på kartet...");
      return new Promise((resolve) => {
        setTimeout(() => {
          geoLayer = L.geoJSON(geojson, {
            style: () => DEFAULT_STYLE,
            onEachFeature: onEachFeature,
          }).addTo(map);
          const bounds = geoLayer.getBounds();
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
          loadFromLocalStorage();
          repaintAll();
          refreshUI();
          hideLoading();
          resolve();
        }, 50);
      });
    })
    .catch((err) => {
      hideLoading();
      document.getElementById("status-total-soner").textContent = "Feil: " + err.message;
      console.error(err);
    });

  function onEachFeature(feature, layer) {
    const props = feature.properties || {};
    const postnr = findAttr(props, POSTNR_KEYS);
    const poststed = findAttr(props, POSTSTED_KEYS);
    if (!postnr) return;
    featureIndex[postnr] = layer;
    allPostnrs.push({ postnr, poststed: poststed || "", layer });
    layer.on("click", () => handleMapClick(postnr));
    layer.bindTooltip(postnr + (poststed ? " " + poststed : ""), {
      sticky: true, className: "leaflet-tooltip",
    });
  }

  // ─── Map click dispatches to active tab ───────────────────────
  function handleMapClick(postnr) {
    if (drawMode) return;
    if (activeTab === "soner") {
      toggleSoner(postnr);
    } else {
      toggleRuter(postnr);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  SONER logic
  // ═══════════════════════════════════════════════════════════════

  function toggleSoner(postnr) {
    if (postnrToZone[postnr]) {
      removeFromGroup(postnr, zones, postnrToZone);
    } else {
      addToGroup(postnr, activeZone, zones, postnrToZone);
    }
    applyStyle(featureIndex[postnr], postnr);
    persist();
    refreshUI();
  }

  // ═══════════════════════════════════════════════════════════════
  //  RUTER logic
  // ═══════════════════════════════════════════════════════════════

  function toggleRuter(postnr) {
    if (postnrToRoute[postnr]) {
      removeFromGroup(postnr, routes, postnrToRoute);
    } else {
      addToGroup(postnr, activeRoute, routes, postnrToRoute);
    }
    applyStyle(featureIndex[postnr], postnr);
    persist();
    refreshUI();
  }

  // ─── Generic group helpers ────────────────────────────────────
  function addToGroup(postnr, groupName, groupObj, lookupObj) {
    if (lookupObj[postnr]) removeFromGroup(postnr, groupObj, lookupObj);
    if (!groupObj[groupName]) groupObj[groupName] = [];
    groupObj[groupName].push(postnr);
    lookupObj[postnr] = groupName;
  }

  function removeFromGroup(postnr, groupObj, lookupObj) {
    const g = lookupObj[postnr];
    if (g && groupObj[g]) {
      groupObj[g] = groupObj[g].filter((p) => p !== postnr);
    }
    delete lookupObj[postnr];
  }

  // ─── LocalStorage ─────────────────────────────────────────────
  const LS_KEY = "postnummer_app";

  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        zones, activeZone, postnrToZone,
        routes, activeRoute, postnrToRoute,
        activeTab,
      }));
    } catch (_) {}
  }

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);

      if (s.zones) {
        zones = s.zones;
        postnrToZone = {};
        for (const [z, list] of Object.entries(zones)) {
          for (const p of list) postnrToZone[p] = z;
        }
      }
      if (s.activeZone && zones[s.activeZone]) activeZone = s.activeZone;
      else activeZone = Object.keys(zones)[0] || "Sone 1";

      if (s.routes) {
        routes = s.routes;
        postnrToRoute = {};
        for (const [r, list] of Object.entries(routes)) {
          for (const p of list) postnrToRoute[p] = r;
        }
      }
      if (s.activeRoute && routes[s.activeRoute]) activeRoute = s.activeRoute;
      else activeRoute = Object.keys(routes)[0] || "Rute 1";

      if (s.activeTab) {
        activeTab = s.activeTab;
        switchTab(activeTab, false);
      }
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════════
  //  TAB NAVIGATION
  // ═══════════════════════════════════════════════════════════════

  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab, true));
  });

  function switchTab(tab, save) {
    activeTab = tab;
    document.querySelectorAll(".nav-tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === tab)
    );
    document.querySelectorAll(".tab-content").forEach((el) =>
      el.classList.toggle("active", el.id === "tab-" + tab)
    );
    repaintAll();
    refreshUI();
    if (save) persist();
  }

  // ═══════════════════════════════════════════════════════════════
  //  UI RENDERING
  // ═══════════════════════════════════════════════════════════════

  function refreshUI() {
    if (activeTab === "soner") refreshSonerUI();
    else refreshRuterUI();
  }

  // ─── Soner UI ─────────────────────────────────────────────────
  function refreshSonerUI() {
    renderGroupSelect("zone-select", zones, activeZone);
    renderGroupLists("zone-lists", zones, postnrToZone, ZONE_COLORS, "soner");
    renderStatusBar("status-total-soner", "status-per-soner", zones, postnrToZone, ZONE_COLORS);
    document.getElementById("zone-color-swatch").style.background =
      groupColor(activeZone, ZONE_COLORS, zones);
  }

  // ─── Ruter UI ─────────────────────────────────────────────────
  function refreshRuterUI() {
    renderGroupSelect("route-select", routes, activeRoute);
    renderGroupLists("route-lists", routes, postnrToRoute, ROUTE_COLORS, "ruter");
    renderStatusBar("status-total-ruter", "status-per-ruter", routes, postnrToRoute, ROUTE_COLORS);
    document.getElementById("route-color-swatch").style.background =
      groupColor(activeRoute, ROUTE_COLORS, routes);
    document.getElementById("route-name-input").value = activeRoute;
  }

  // ─── Generic renderers ────────────────────────────────────────
  function renderGroupSelect(selectId, groupObj, activeGroup) {
    const sel = document.getElementById(selectId);
    sel.innerHTML = "";
    for (const name of Object.keys(groupObj)) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name + " (" + groupObj[name].length + ")";
      if (name === activeGroup) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function renderStatusBar(totalId, perId, groupObj, lookupObj, colors) {
    const total = Object.keys(lookupObj).length;
    document.getElementById(totalId).textContent = "Totalt valgt: " + total;
    const perEl = document.getElementById(perId);
    perEl.innerHTML = "";
    for (const [name, list] of Object.entries(groupObj)) {
      const span = document.createElement("span");
      span.className = "status-zone-item";
      span.innerHTML =
        '<span class="status-zone-dot" style="background:' +
        groupColor(name, colors, groupObj) + '"></span>' +
        name + ": " + list.length;
      perEl.appendChild(span);
    }
  }

  function renderGroupLists(containerId, groupObj, lookupObj, colors, mode) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    for (const [name, list] of Object.entries(groupObj)) {
      const block = document.createElement("div");
      block.className = "zone-block";

      const header = document.createElement("div");
      header.className = "zone-block-header";
      header.innerHTML =
        '<span class="zone-dot" style="background:' +
        groupColor(name, colors, groupObj) + '"></span>' +
        name + " (" + list.length + ")";
      block.appendChild(header);

      const body = document.createElement("div");
      body.className = "zone-block-body";

      if (list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "zone-block-empty";
        empty.textContent = mode === "soner" ? "Ingen postnummer valgt" : "Ingen postnummer i ruten";
        body.appendChild(empty);
      } else {
        const sorted = [...list].sort();
        for (const pnr of sorted) {
          const entry = document.createElement("div");
          entry.className = "zone-entry";
          const info = allPostnrs.find((a) => a.postnr === pnr);
          const label = pnr + (info && info.poststed ? " – " + info.poststed : "");
          entry.innerHTML =
            '<span class="zone-entry-label">' + label + "</span>" +
            '<button title="Fjern">&times;</button>';
          entry.querySelector("button").addEventListener("click", () => {
            removeFromGroup(pnr, groupObj, lookupObj);
            applyStyle(featureIndex[pnr], pnr);
            persist();
            refreshUI();
          });
          entry.querySelector(".zone-entry-label").addEventListener("click", () => {
            zoomToPostnr(pnr);
          });
          entry.querySelector(".zone-entry-label").style.cursor = "pointer";
          body.appendChild(entry);
        }
      }

      block.appendChild(body);
      container.appendChild(block);
    }
  }

  function zoomToPostnr(postnr) {
    const layer = featureIndex[postnr];
    if (layer) {
      map.fitBounds(layer.getBounds(), { maxZoom: 14, padding: [40, 40] });
      layer.openTooltip();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  SONER events
  // ═══════════════════════════════════════════════════════════════

  document.getElementById("zone-select").addEventListener("change", function () {
    activeZone = this.value;
    persist();
    refreshSonerUI();
  });

  document.getElementById("btn-add-zone").addEventListener("click", function () {
    let n = Object.keys(zones).length + 1;
    let name = "Sone " + n;
    while (zones[name]) { n++; name = "Sone " + n; }
    zones[name] = [];
    activeZone = name;
    persist(); refreshUI();
  });

  document.getElementById("btn-remove-zone").addEventListener("click", function () {
    if (Object.keys(zones).length <= 1) return;
    for (const pnr of (zones[activeZone] || [])) {
      delete postnrToZone[pnr];
      if (featureIndex[pnr]) applyStyle(featureIndex[pnr], pnr);
    }
    delete zones[activeZone];
    activeZone = Object.keys(zones)[0];
    persist(); refreshUI();
  });

  document.getElementById("btn-clear-soner").addEventListener("click", function () {
    for (const pnr of Object.keys(postnrToZone)) {
      delete postnrToZone[pnr];
      if (featureIndex[pnr]) applyStyle(featureIndex[pnr], pnr);
    }
    for (const z of Object.keys(zones)) zones[z] = [];
    persist(); refreshUI();
  });

  // ─── Soner search ────────────────────────────────────────────
  setupSearch("search-input-soner", "search-results-soner", postnrToZone, ZONE_COLORS, zones);

  // ─── Soner export/import ─────────────────────────────────────
  document.getElementById("btn-export-json-soner").addEventListener("click", () =>
    exportJSON(zones, "postnummer_soner.json"));

  document.getElementById("btn-export-csv-soner").addEventListener("click", () =>
    exportCSV(zones, "postnummer_soner.csv"));

  document.getElementById("file-import-soner").addEventListener("change", function (e) {
    importJSON(e, zones, postnrToZone, (z, az) => { zones = z; activeZone = az; }, "Sone 1");
    this.value = "";
  });

  // ═══════════════════════════════════════════════════════════════
  //  RUTER events
  // ═══════════════════════════════════════════════════════════════

  document.getElementById("route-select").addEventListener("change", function () {
    activeRoute = this.value;
    persist(); refreshRuterUI();
  });

  document.getElementById("btn-add-route").addEventListener("click", function () {
    let n = Object.keys(routes).length + 1;
    let name = "Rute " + n;
    while (routes[name]) { n++; name = "Rute " + n; }
    routes[name] = [];
    activeRoute = name;
    persist(); refreshUI();
  });

  document.getElementById("btn-remove-route").addEventListener("click", function () {
    if (Object.keys(routes).length <= 1) return;
    for (const pnr of (routes[activeRoute] || [])) {
      delete postnrToRoute[pnr];
      if (featureIndex[pnr]) applyStyle(featureIndex[pnr], pnr);
    }
    delete routes[activeRoute];
    activeRoute = Object.keys(routes)[0];
    persist(); refreshUI();
  });

  document.getElementById("btn-rename-route").addEventListener("click", function () {
    const newName = document.getElementById("route-name-input").value.trim();
    if (!newName || newName === activeRoute) return;
    if (routes[newName]) { alert("Navnet er allerede i bruk."); return; }
    routes[newName] = routes[activeRoute];
    delete routes[activeRoute];
    for (const pnr of routes[newName]) {
      postnrToRoute[pnr] = newName;
    }
    activeRoute = newName;
    repaintAll();
    persist(); refreshUI();
  });

  document.getElementById("btn-clear-ruter").addEventListener("click", function () {
    for (const pnr of Object.keys(postnrToRoute)) {
      delete postnrToRoute[pnr];
      if (featureIndex[pnr]) applyStyle(featureIndex[pnr], pnr);
    }
    for (const r of Object.keys(routes)) routes[r] = [];
    persist(); refreshUI();
  });

  // ─── Ruter search ────────────────────────────────────────────
  setupSearch("search-input-ruter", "search-results-ruter", postnrToRoute, ROUTE_COLORS, routes);

  // ─── Ruter export/import ─────────────────────────────────────
  document.getElementById("btn-export-json-ruter").addEventListener("click", () =>
    exportJSON(routes, "postnummer_ruter.json"));

  document.getElementById("btn-export-csv-ruter").addEventListener("click", () =>
    exportCSV(routes, "postnummer_ruter.csv"));

  document.getElementById("file-import-ruter").addEventListener("change", function (e) {
    importJSON(e, routes, postnrToRoute, (r, ar) => { routes = r; activeRoute = ar; }, "Rute 1");
    this.value = "";
  });

  // ═══════════════════════════════════════════════════════════════
  //  SHARED: search, export, import
  // ═══════════════════════════════════════════════════════════════

  function setupSearch(inputId, resultsId, lookupObj, colors, groupObj) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);
    input.addEventListener("input", function () {
      const q = this.value.trim().toLowerCase();
      results.innerHTML = "";
      if (q.length < 2) return;
      const matches = allPostnrs
        .filter((a) => a.postnr.includes(q) || a.poststed.toLowerCase().includes(q))
        .slice(0, 50);
      for (const m of matches) {
        const div = document.createElement("div");
        div.className = "search-result-item";
        div.textContent = m.postnr + (m.poststed ? " – " + m.poststed : "");
        const g = lookupObj[m.postnr];
        if (g) div.style.borderLeft = "3px solid " + groupColor(g, colors, groupObj);
        div.addEventListener("click", () => zoomToPostnr(m.postnr));
        results.appendChild(div);
      }
    });
  }

  function exportJSON(groupObj, filename) {
    const blob = new Blob([JSON.stringify(groupObj, null, 2)], { type: "application/json" });
    downloadBlob(blob, filename);
  }

  function exportCSV(groupObj, filename) {
    const BOM = "\uFEFF";
    let csv = BOM + "Country;Postcode;Territory;City\n";
    for (const [name, list] of Object.entries(groupObj)) {
      const sorted = [...list].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      for (const pnr of sorted) {
        const info = allPostnrs.find((a) => a.postnr === pnr);
        const city = info && info.poststed ? info.poststed : "";
        csv += "Norway;" + parseInt(pnr, 10) + ";" + name + ";" + city + "\n";
      }
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importJSON(e, currentGroupObj, lookupObj, setter, defaultName) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const imported = JSON.parse(ev.target.result);
        if (typeof imported !== "object" || Array.isArray(imported)) {
          alert("Ugyldig JSON-format."); return;
        }
        for (const pnr of Object.keys(lookupObj)) {
          delete lookupObj[pnr];
          if (featureIndex[pnr]) applyStyle(featureIndex[pnr], pnr);
        }
        const newGroup = {};
        for (const [name, list] of Object.entries(imported)) {
          if (!Array.isArray(list)) continue;
          newGroup[name] = [];
          for (const pnr of list) {
            const key = String(pnr);
            if (!newGroup[name]) newGroup[name] = [];
            newGroup[name].push(key);
            lookupObj[key] = name;
            if (featureIndex[key]) applyStyle(featureIndex[key], key);
          }
        }
        if (Object.keys(newGroup).length === 0) newGroup[defaultName] = [];
        setter(newGroup, Object.keys(newGroup)[0]);
        repaintAll();
        persist(); refreshUI();
      } catch (err) { alert("Feil ved import: " + err.message); }
    };
    reader.readAsText(file);
  }

  // ═══════════════════════════════════════════════════════════════
  //  RADIUS-BASED ZONE ASSIGNMENT (Soner only)
  // ═══════════════════════════════════════════════════════════════

  document.getElementById("btn-radius-apply").addEventListener("click", function () {
    const centerPnr = document.getElementById("radius-center").value.trim();
    const stepKm = parseFloat(document.getElementById("radius-step").value);
    const numZones = parseInt(document.getElementById("radius-max").value, 10);
    const collectRest = document.getElementById("radius-rest-toggle").checked;

    if (!centerPnr) { alert("Skriv inn et sentrum-postnummer."); return; }
    if (!featureIndex[centerPnr]) { alert("Postnummer " + centerPnr + " finnes ikke."); return; }
    if (isNaN(stepKm) || stepKm <= 0 || isNaN(numZones) || numZones < 1) {
      alert("Ugyldig km-steg eller antall soner."); return;
    }

    const center = getCentroid(featureIndex[centerPnr]);

    for (const pnr of Object.keys(postnrToZone)) {
      delete postnrToZone[pnr];
    }
    zones = {};
    for (let i = 1; i <= numZones; i++) zones["Sone " + i] = [];

    const preview = document.getElementById("radius-preview");
    preview.innerHTML = "";
    const counts = new Array(numZones).fill(0);
    let outsideCount = 0;

    for (const item of allPostnrs) {
      const c = getCentroid(item.layer);
      const dist = haversineKm(center.lat, center.lng, c.lat, c.lng);
      const band = Math.floor(dist / stepKm);
      if (band < numZones) {
        addToGroup(item.postnr, "Sone " + (band + 1), zones, postnrToZone);
        counts[band]++;
      } else if (collectRest) {
        addToGroup(item.postnr, "Sone " + numZones, zones, postnrToZone);
        counts[numZones - 1]++;
      } else {
        outsideCount++;
      }
    }

    for (let i = 0; i < numZones; i++) {
      const from = i * stepKm;
      const to = (i + 1) * stepKm;
      const div = document.createElement("div");
      div.className = "preview-band";
      const isLast = (i === numZones - 1) && collectRest;
      div.innerHTML =
        "<span>Sone " + (i + 1) + " (" + (isLast ? from + " km+" : from + "–" + to + " km") + ")</span>" +
        "<span>" + counts[i] + " stk</span>";
      preview.appendChild(div);
    }
    if (outsideCount > 0) {
      const div = document.createElement("div");
      div.className = "preview-band";
      div.innerHTML = "<span>Utenfor</span><span>" + outsideCount + " stk</span>";
      preview.appendChild(div);
    }

    activeZone = "Sone 1";
    repaintAll();
    persist(); refreshUI();
    map.setView([center.lat, center.lng], 8);
  });

  let radiusCircles = [];
  document.getElementById("radius-center").addEventListener("change", updateRadiusPreviewCircles);
  document.getElementById("radius-step").addEventListener("change", updateRadiusPreviewCircles);
  document.getElementById("radius-max").addEventListener("change", updateRadiusPreviewCircles);

  function updateRadiusPreviewCircles() {
    for (const c of radiusCircles) map.removeLayer(c);
    radiusCircles = [];
    const centerPnr = document.getElementById("radius-center").value.trim();
    const stepKm = parseFloat(document.getElementById("radius-step").value);
    const numZones = parseInt(document.getElementById("radius-max").value, 10);
    if (!centerPnr || !featureIndex[centerPnr] || isNaN(stepKm) || isNaN(numZones)) return;
    const center = getCentroid(featureIndex[centerPnr]);
    for (let i = 1; i <= numZones; i++) {
      const circle = L.circle([center.lat, center.lng], {
        radius: i * stepKm * 1000,
        color: ZONE_COLORS[(i - 1) % ZONE_COLORS.length],
        weight: 1.5, dashArray: "6 4", fill: false, interactive: false,
      }).addTo(map);
      radiusCircles.push(circle);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DRAW-TO-SELECT TOOL
  // ═══════════════════════════════════════════════════════════════

  let drawMode = null;         // null | "circle" | "rect" | "lasso"
  let drawOrigin = null;       // {lat, lng} for circle/rect start
  let drawPreview = null;      // Leaflet layer shown while drawing
  let lassoPoints = [];        // [{lat, lng}, ...] for lasso
  let lassoPolyline = null;
  let lassoDrawing = false;    // true while mouse is held down in lasso mode

  const mapEl = document.getElementById("map");
  const cancelBtn = document.getElementById("draw-cancel");

  document.querySelectorAll(".draw-btn[data-tool]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tool = btn.dataset.tool;
      if (drawMode === tool) {
        exitDrawMode();
      } else {
        enterDrawMode(tool);
      }
    });
  });

  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exitDrawMode();
  });

  function enterDrawMode(tool) {
    exitDrawMode();
    drawMode = tool;
    mapEl.classList.add("draw-mode");
    map.dragging.disable();
    map.doubleClickZoom.disable();
    cancelBtn.classList.remove("hidden");
    document.querySelectorAll(".draw-btn[data-tool]").forEach((b) =>
      b.classList.toggle("active", b.dataset.tool === tool)
    );
    map.on("mousedown", onDrawMouseDown);
    map.on("mousemove", onDrawMouseMove);
    map.on("mouseup", onDrawMouseUp);
  }

  function exitDrawMode() {
    drawMode = null;
    drawOrigin = null;
    lassoPoints = [];
    lassoDrawing = false;
    mapEl.classList.remove("draw-mode");
    map.dragging.enable();
    map.doubleClickZoom.enable();
    cancelBtn.classList.add("hidden");
    document.querySelectorAll(".draw-btn[data-tool]").forEach((b) =>
      b.classList.remove("active")
    );
    if (drawPreview) { map.removeLayer(drawPreview); drawPreview = null; }
    if (lassoPolyline) { map.removeLayer(lassoPolyline); lassoPolyline = null; }
    map.off("mousedown", onDrawMouseDown);
    map.off("mousemove", onDrawMouseMove);
    map.off("mouseup", onDrawMouseUp);
  }

  // ─── Unified draw events ──────────────────────────────────────
  function onDrawMouseDown(e) {
    if (drawMode === "lasso") {
      lassoDrawing = true;
      lassoPoints = [e.latlng];
      if (lassoPolyline) { map.removeLayer(lassoPolyline); lassoPolyline = null; }
      return;
    }
    drawOrigin = e.latlng;
    if (drawPreview) { map.removeLayer(drawPreview); drawPreview = null; }
  }

  function onDrawMouseMove(e) {
    if (drawMode === "lasso" && lassoDrawing) {
      lassoPoints.push(e.latlng);
      if (lassoPolyline) map.removeLayer(lassoPolyline);
      lassoPolyline = L.polyline(lassoPoints, {
        color: "#e74c3c", weight: 2.5, interactive: false,
      }).addTo(map);
      return;
    }

    if (!drawOrigin) return;
    if (drawPreview) map.removeLayer(drawPreview);

    if (drawMode === "circle") {
      const radius = drawOrigin.distanceTo(e.latlng);
      drawPreview = L.circle(drawOrigin, {
        radius: radius,
        color: "#e74c3c", weight: 2, dashArray: "6 4",
        fillColor: "#e74c3c", fillOpacity: 0.12, interactive: false,
      }).addTo(map);
    } else if (drawMode === "rect") {
      drawPreview = L.rectangle([drawOrigin, e.latlng], {
        color: "#e74c3c", weight: 2, dashArray: "6 4",
        fillColor: "#e74c3c", fillOpacity: 0.12, interactive: false,
      }).addTo(map);
    }
  }

  function onDrawMouseUp(e) {
    if (drawMode === "lasso" && lassoDrawing) {
      lassoDrawing = false;
      if (lassoPoints.length < 10) { lassoPoints = []; return; }
      lassoPoints.push(lassoPoints[0]);

      if (lassoPolyline) { map.removeLayer(lassoPolyline); lassoPolyline = null; }
      const polygon = L.polygon(lassoPoints, {
        color: "#e74c3c", weight: 2,
        fillColor: "#e74c3c", fillOpacity: 0.12, interactive: false,
      }).addTo(map);

      selectInsideLasso(lassoPoints);
      setTimeout(() => map.removeLayer(polygon), 800);
      exitDrawMode();
      return;
    }

    if (!drawOrigin) return;

    if (drawMode === "circle") {
      const radius = drawOrigin.distanceTo(e.latlng);
      if (radius < 100) { drawOrigin = null; return; }
      selectInsideCircle(drawOrigin, radius);
    } else if (drawMode === "rect") {
      const bounds = L.latLngBounds(drawOrigin, e.latlng);
      if (bounds.getNorthEast().equals(bounds.getSouthWest())) { drawOrigin = null; return; }
      selectInsideRect(bounds);
    }

    drawOrigin = null;
    setTimeout(() => {
      if (drawPreview) { map.removeLayer(drawPreview); drawPreview = null; }
    }, 600);
    exitDrawMode();
  }

  // ─── Containment tests & selection ────────────────────────────
  function selectInsideCircle(center, radiusMeters) {
    const selected = [];
    for (const item of allPostnrs) {
      const c = getCentroid(item.layer);
      const dist = center.distanceTo(L.latLng(c.lat, c.lng));
      if (dist <= radiusMeters) selected.push(item.postnr);
    }
    addSelectedToActiveGroup(selected);
  }

  function selectInsideRect(bounds) {
    const selected = [];
    for (const item of allPostnrs) {
      const c = getCentroid(item.layer);
      if (bounds.contains(L.latLng(c.lat, c.lng))) selected.push(item.postnr);
    }
    addSelectedToActiveGroup(selected);
  }

  function selectInsideLasso(latlngs) {
    const poly = latlngs.map((ll) => [ll.lat, ll.lng]);
    const selected = [];
    for (const item of allPostnrs) {
      const c = getCentroid(item.layer);
      if (pointInPolygon([c.lat, c.lng], poly)) selected.push(item.postnr);
    }
    addSelectedToActiveGroup(selected);
  }

  function pointInPolygon(point, polygon) {
    const [py, px] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [iy, ix] = polygon[i];
      const [jy, jx] = polygon[j];
      if (((iy > py) !== (jy > py)) &&
          (px < (jx - ix) * (py - iy) / (jy - iy) + ix)) {
        inside = !inside;
      }
    }
    return inside;
  }

  function addSelectedToActiveGroup(postnrList) {
    if (postnrList.length === 0) return;
    const groupObj = activeTab === "soner" ? zones : routes;
    const lookupObj = activeTab === "soner" ? postnrToZone : postnrToRoute;
    const activeGroup = activeTab === "soner" ? activeZone : activeRoute;

    for (const pnr of postnrList) {
      if (!lookupObj[pnr]) {
        addToGroup(pnr, activeGroup, groupObj, lookupObj);
        if (featureIndex[pnr]) applyStyle(featureIndex[pnr], pnr);
      }
    }
    persist();
    refreshUI();
  }

})();
