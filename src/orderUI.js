import { randomAddress } from "./addresses.js";
import { zones, routes, activeTab } from "./state.js";
import { map } from "./map.js";

const KOLLI_TYPES = [
  { type: "Boks", minAntall: 1, maxAntall: 10 },
  { type: "Pall", minAntall: 1, maxAntall: 4 },
  { type: "Konvolutt", minAntall: 1, maxAntall: 20 },
  { type: "Rull", minAntall: 1, maxAntall: 6 },
  { type: "Sekk", minAntall: 1, maxAntall: 8 },
];

let currentOrders = [];
let orderMarkers = [];

const panel = document.getElementById("order-panel");
const openBtn = document.getElementById("btn-open-orders");
const closeBtn = document.getElementById("order-panel-close");
const groupsContainer = document.getElementById("order-gen-groups");
const countInput = document.getElementById("order-gen-count");
const genBtn = document.getElementById("btn-gen-orders");
const genStatus = document.getElementById("order-gen-status");
const resultsList = document.getElementById("order-results");
const copyBtn = document.getElementById("btn-copy-orders");
const csvBtn = document.getElementById("btn-export-orders-csv");
const jsonBtn = document.getElementById("btn-export-orders-json");
const mapBtn = document.getElementById("btn-show-orders-map");

let markersVisible = false;

export function initOrderUI() {
  openBtn.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) refreshGroupCheckboxes();
  });
  closeBtn.addEventListener("click", () => panel.classList.add("hidden"));
  genBtn.addEventListener("click", generateOrders);
  copyBtn.addEventListener("click", copyToClipboard);
  csvBtn.addEventListener("click", downloadCSV);
  jsonBtn.addEventListener("click", downloadJSON);
  mapBtn.addEventListener("click", toggleMapMarkers);
}

function getManager() {
  return activeTab === "soner" ? zones : routes;
}

function refreshGroupCheckboxes() {
  const mgr = getManager();
  groupsContainer.innerHTML = "";
  for (const name of Object.keys(mgr.groups)) {
    const count = mgr.groups[name].length;
    if (count === 0) continue;
    const label = document.createElement("label");
    label.className = "order-checkbox-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = name;
    cb.checked = true;
    const dot = document.createElement("span");
    dot.className = "order-checkbox-dot";
    dot.style.background = mgr.color(name);
    const text = document.createTextNode(" " + name + " (" + count + ")");
    label.appendChild(cb);
    label.appendChild(dot);
    label.appendChild(text);
    groupsContainer.appendChild(label);
  }
  if (groupsContainer.children.length === 0) {
    groupsContainer.innerHTML = '<span style="color:#999;font-size:0.82rem;font-style:italic">Ingen soner med postnumre</span>';
  }
}

function getSelectedGroups() {
  const mgr = getManager();
  const checked = groupsContainer.querySelectorAll('input[type="checkbox"]:checked');
  const result = [];
  for (const cb of checked) {
    const name = cb.value;
    if (mgr.groups[name]) result.push({ name, postnumre: mgr.groups[name] });
  }
  return result;
}

function randomKolli() {
  const k = KOLLI_TYPES[Math.floor(Math.random() * KOLLI_TYPES.length)];
  const antall = k.minAntall + Math.floor(Math.random() * (k.maxAntall - k.minAntall + 1));
  return { type: k.type, antall };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateOrders() {
  const selected = getSelectedGroups();
  if (selected.length === 0) {
    genStatus.textContent = "Kryss av minst én sone.";
    return;
  }

  const allPostnumre = selected.flatMap((g) => g.postnumre);
  if (allPostnumre.length === 0) {
    genStatus.textContent = "Ingen postnumre i valgte soner.";
    return;
  }

  const totalCount = parseInt(countInput.value, 10) || 5;
  genBtn.disabled = true;
  currentOrders = [];
  resultsList.innerHTML = "";
  genStatus.textContent = "Genererer ordre...";

  let created = 0;
  let attempts = 0;
  const maxAttempts = totalCount * 5;

  while (created < totalCount && attempts < maxAttempts) {
    attempts++;
    genStatus.textContent = "Genererer ordre " + (created + 1) + "/" + totalCount + "...";

    const hentePnr = pickRandom(allPostnumre);
    const leverPnr = pickRandom(allPostnumre);

    let henteAddr, leverAddr;
    try {
      [henteAddr, leverAddr] = await Promise.all([
        randomAddress(hentePnr),
        randomAddress(leverPnr),
      ]);
    } catch (_) { continue; }

    if (!henteAddr || !leverAddr) continue;

    const henteSone = selected.find((g) => g.postnumre.includes(hentePnr))?.name || "";
    const leverSone = selected.find((g) => g.postnumre.includes(leverPnr))?.name || "";

    created++;
    const kolli = randomKolli();
    const order = {
      ordreNr: "ORD-" + String(Date.now()).slice(-6) + "-" + String(created).padStart(3, "0"),
      hentested: henteAddr,
      henteSone,
      leveringsted: leverAddr,
      leverSone,
      kolli,
    };

    currentOrders.push(order);
    appendOrderRow(order);
  }

  genStatus.textContent = currentOrders.length + " ordre generert.";
  genBtn.disabled = false;
}

function appendOrderRow(order) {
  const div = document.createElement("div");
  div.className = "order-item";
  div.innerHTML =
    '<div class="order-item-header">' +
      '<span class="order-nr">' + order.ordreNr + '</span>' +
      '<span class="order-kolli">' + order.kolli.antall + 'x ' + order.kolli.type + '</span>' +
    '</div>' +
    '<div class="order-row">' +
      '<span class="order-label order-link" data-type="hente">Hente:</span>' +
      '<span class="order-addr order-link" data-type="hente">' + esc(order.hentested.text) + ', ' + order.hentested.postnummer + ' ' + order.hentested.poststed +
      (order.henteSone ? ' <span class="order-sone-tag">' + esc(order.henteSone) + '</span>' : '') + '</span>' +
    '</div>' +
    '<div class="order-row">' +
      '<span class="order-label order-link" data-type="lever">Lever:</span>' +
      '<span class="order-addr order-link" data-type="lever">' + esc(order.leveringsted.text) + ', ' + order.leveringsted.postnummer + ' ' + order.leveringsted.poststed +
      (order.leverSone ? ' <span class="order-sone-tag">' + esc(order.leverSone) + '</span>' : '') + '</span>' +
    '</div>';

  div.querySelectorAll('[data-type="hente"]').forEach((el) => {
    el.addEventListener("click", () => zoomToAddress(order.hentested, "Hente – " + order.ordreNr));
  });
  div.querySelectorAll('[data-type="lever"]').forEach((el) => {
    el.addEventListener("click", () => zoomToAddress(order.leveringsted, "Lever – " + order.ordreNr));
  });

  resultsList.appendChild(div);
  resultsList.scrollTop = resultsList.scrollHeight;
}

function zoomToAddress(addr, label) {
  if (!addr.lat || !addr.lng) return;
  map.setView([addr.lat, addr.lng], 16);
  L.popup()
    .setLatLng([addr.lat, addr.lng])
    .setContent("<b>" + esc(label) + "</b><br>" + esc(addr.text) + "<br>" + addr.postnummer + " " + addr.poststed)
    .openOn(map);
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function copyToClipboard() {
  if (currentOrders.length === 0) return;
  const lines = currentOrders.map((o) =>
    o.ordreNr + " | Hente: " + o.hentested.text + ", " + o.hentested.postnummer + " (" + o.henteSone + ")" +
    " | Lever: " + o.leveringsted.text + ", " + o.leveringsted.postnummer + " (" + o.leverSone + ")" +
    " | " + o.kolli.antall + "x " + o.kolli.type
  );
  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    copyBtn.textContent = "Kopiert!";
    setTimeout(() => { copyBtn.textContent = "Kopier"; }, 1500);
  });
}

function downloadCSV() {
  if (currentOrders.length === 0) return;
  const BOM = "\uFEFF";
  let csv = BOM + "OrdreNr;HenteAdresse;HentePostnr;HentePoststed;HenteSone;LeverAdresse;LeverPostnr;LeverPoststed;LeverSone;KolliType;KolliAntall\n";
  for (const o of currentOrders) {
    csv += [
      o.ordreNr,
      o.hentested.text, o.hentested.postnummer, o.hentested.poststed, o.henteSone,
      o.leveringsted.text, o.leveringsted.postnummer, o.leveringsted.poststed, o.leverSone,
      o.kolli.type, o.kolli.antall,
    ].join(";") + "\n";
  }
  downloadBlob(csv, "ordre.csv", "text/csv;charset=utf-8");
}

function downloadJSON() {
  if (currentOrders.length === 0) return;
  const data = currentOrders.map((o) => ({
    ordreNr: o.ordreNr,
    hentested: {
      adresse: o.hentested.text,
      postnummer: o.hentested.postnummer,
      poststed: o.hentested.poststed,
      sone: o.henteSone,
      lat: o.hentested.lat,
      lng: o.hentested.lng,
    },
    leveringsted: {
      adresse: o.leveringsted.text,
      postnummer: o.leveringsted.postnummer,
      poststed: o.leveringsted.poststed,
      sone: o.leverSone,
      lat: o.leveringsted.lat,
      lng: o.leveringsted.lng,
    },
    kolli: o.kolli,
  }));
  downloadBlob(JSON.stringify(data, null, 2), "ordre.json", "application/json");
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toggleMapMarkers() {
  if (markersVisible) {
    clearMapMarkers();
  } else {
    showOnMap();
  }
}

function showOnMap() {
  clearMapMarkers();
  if (currentOrders.length === 0) return;

  for (const o of currentOrders) {
    if (o.hentested.lat && o.hentested.lng) {
      const m = L.circleMarker([o.hentested.lat, o.hentested.lng], {
        radius: 6, color: "#2980b9", weight: 2, fillColor: "#2980b9", fillOpacity: 0.8,
      }).addTo(map);
      m.bindPopup("<b>Hente</b> " + o.ordreNr + "<br>" + esc(o.hentested.text));
      orderMarkers.push(m);
    }
    if (o.leveringsted.lat && o.leveringsted.lng) {
      const m = L.circleMarker([o.leveringsted.lat, o.leveringsted.lng], {
        radius: 6, color: "#e74c3c", weight: 2, fillColor: "#e74c3c", fillOpacity: 0.8,
      }).addTo(map);
      m.bindPopup("<b>Lever</b> " + o.ordreNr + "<br>" + esc(o.leveringsted.text));
      orderMarkers.push(m);
    }
  }

  if (orderMarkers.length > 0) {
    map.fitBounds(L.featureGroup(orderMarkers).getBounds(), { padding: [40, 40], maxZoom: 14 });
  }
  markersVisible = true;
  mapBtn.textContent = "Fjern markører";
}

function clearMapMarkers() {
  for (const m of orderMarkers) map.removeLayer(m);
  orderMarkers = [];
  markersVisible = false;
  mapBtn.textContent = "Vis på kart";
}
