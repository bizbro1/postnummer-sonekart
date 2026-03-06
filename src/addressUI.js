import { fetchAddresses, randomAddressesForGroup, searchAddress } from "./addresses.js";
import { zones, routes, activeTab } from "./state.js";
import { map, featureIndex, zoomToPostnr } from "./map.js";

let addressMarkers = [];
let currentResults = [];

const panel = document.getElementById("address-panel");
const openBtn = document.getElementById("btn-open-addresses");
const closeBtn = document.getElementById("address-panel-close");
const searchInput = document.getElementById("address-search-input");
const searchResults = document.getElementById("address-search-results");
const genGroup = document.getElementById("address-gen-group");
const genCount = document.getElementById("address-gen-count");
const genBtn = document.getElementById("btn-gen-addresses");
const genStatus = document.getElementById("address-gen-status");
const resultsList = document.getElementById("address-results");
const copyBtn = document.getElementById("btn-copy-addresses");
const csvBtn = document.getElementById("btn-export-addresses-csv");
const mapBtn = document.getElementById("btn-show-on-map");

let searchTimer = null;

export function initAddressUI() {
  openBtn.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) refreshGroupSelect();
  });
  closeBtn.addEventListener("click", () => panel.classList.add("hidden"));

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(doAddressSearch, 250);
  });

  genBtn.addEventListener("click", generateAddresses);
  copyBtn.addEventListener("click", copyToClipboard);
  csvBtn.addEventListener("click", downloadCSV);
  mapBtn.addEventListener("click", showOnMap);
}

function getManager() {
  return activeTab === "soner" ? zones : routes;
}

function refreshGroupSelect() {
  const mgr = getManager();
  genGroup.innerHTML = '<option value="__all__">Alle grupper</option>';
  for (const name of Object.keys(mgr.groups)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name + " (" + mgr.groups[name].length + " postnr)";
    genGroup.appendChild(opt);
  }
}

async function doAddressSearch() {
  const q = searchInput.value.trim();
  searchResults.innerHTML = "";
  if (q.length < 3) return;

  searchResults.innerHTML = '<div style="padding:6px;color:#888;font-size:0.8rem">Søker...</div>';
  try {
    const results = await searchAddress(q);
    searchResults.innerHTML = "";
    if (results.length === 0) {
      searchResults.innerHTML = '<div style="padding:6px;color:#888;font-size:0.8rem">Ingen treff</div>';
      return;
    }
    for (const r of results) {
      const div = document.createElement("div");
      div.className = "search-result-item";
      div.textContent = r.text + " – " + r.postnummer + " " + r.poststed;
      div.addEventListener("click", () => {
        if (r.lat && r.lng) {
          map.setView([r.lat, r.lng], 16);
          L.popup().setLatLng([r.lat, r.lng])
            .setContent("<b>" + r.text + "</b><br>" + r.postnummer + " " + r.poststed)
            .openOn(map);
        } else if (featureIndex[r.postnummer]) {
          zoomToPostnr(r.postnummer);
        }
      });
      searchResults.appendChild(div);
    }
  } catch (err) {
    searchResults.innerHTML = '<div style="padding:6px;color:#c0392b;font-size:0.8rem">Feil: ' + err.message + '</div>';
  }
}

async function generateAddresses() {
  const mgr = getManager();
  const groupName = genGroup.value;
  const countPer = parseInt(genCount.value, 10) || 1;

  let postnumre;
  if (groupName === "__all__") {
    postnumre = Object.values(mgr.groups).flat();
  } else {
    postnumre = mgr.groups[groupName] || [];
  }

  if (postnumre.length === 0) {
    genStatus.textContent = "Ingen postnumre i valgt gruppe.";
    return;
  }

  genBtn.disabled = true;
  genStatus.textContent = "Henter adresser for " + postnumre.length + " postnumre...";

  try {
    currentResults = await randomAddressesForGroup(postnumre, countPer);
    genStatus.textContent = currentResults.length + " tilfeldige adresser generert.";
    renderResults(currentResults);
  } catch (err) {
    genStatus.textContent = "Feil: " + err.message;
  } finally {
    genBtn.disabled = false;
  }
}

function renderResults(list) {
  resultsList.innerHTML = "";
  if (list.length === 0) {
    resultsList.innerHTML = '<div style="padding:8px;color:#999;font-size:0.82rem;font-style:italic">Ingen adresser funnet</div>';
    return;
  }
  for (const addr of list) {
    const div = document.createElement("div");
    div.className = "address-item";
    div.innerHTML =
      '<div class="address-item-text">' +
        '<div class="addr-main">' + escHtml(addr.text || addr.full) + '</div>' +
        '<div class="addr-sub">' + escHtml(addr.postnummer + " " + addr.poststed + " – " + addr.kommune) + '</div>' +
      '</div>';
    div.querySelector(".address-item-text").addEventListener("click", () => {
      if (addr.lat && addr.lng) {
        map.setView([addr.lat, addr.lng], 16);
        L.popup().setLatLng([addr.lat, addr.lng])
          .setContent("<b>" + escHtml(addr.text || addr.full) + "</b><br>" + addr.postnummer + " " + addr.poststed)
          .openOn(map);
      }
    });
    resultsList.appendChild(div);
  }
}

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function copyToClipboard() {
  if (currentResults.length === 0) return;
  const text = currentResults.map((a) =>
    (a.text || a.full) + ", " + a.postnummer + " " + a.poststed
  ).join("\n");
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = "Kopiert!";
    setTimeout(() => { copyBtn.textContent = "Kopier"; }, 1500);
  });
}

function downloadCSV() {
  if (currentResults.length === 0) return;
  const BOM = "\uFEFF";
  let csv = BOM + "Adresse;Postnummer;Poststed;Kommune;Lat;Lng\n";
  for (const a of currentResults) {
    csv += [a.text || a.full, a.postnummer, a.poststed, a.kommune, a.lat || "", a.lng || ""].join(";") + "\n";
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tilfeldige_adresser.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function showOnMap() {
  clearMapMarkers();
  if (currentResults.length === 0) return;

  for (const addr of currentResults) {
    if (!addr.lat || !addr.lng) continue;
    const marker = L.circleMarker([addr.lat, addr.lng], {
      radius: 5, color: "#e74c3c", weight: 2,
      fillColor: "#e74c3c", fillOpacity: 0.8,
    }).addTo(map);
    marker.bindPopup("<b>" + escHtml(addr.text || addr.full) + "</b><br>" + addr.postnummer + " " + addr.poststed);
    addressMarkers.push(marker);
  }

  if (addressMarkers.length > 0) {
    const group = L.featureGroup(addressMarkers);
    map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 14 });
  }
  mapBtn.textContent = "Fjern markører";
  mapBtn.onclick = () => {
    clearMapMarkers();
    mapBtn.textContent = "Vis på kart";
    mapBtn.onclick = showOnMap;
  };
}

function clearMapMarkers() {
  for (const m of addressMarkers) map.removeLayer(m);
  addressMarkers = [];
}
