import { map, allPostnrs, featureIndex, repaintAll } from "./map.js";
import { ZONE_COLORS } from "./constants.js";
import { zones, persist } from "./state.js";
import { haversineKm, getCentroid } from "./geo.js";
import { refreshUI } from "./ui.js";

let radiusCircles = [];

export function initRadius() {
  document.getElementById("btn-radius-apply").addEventListener("click", applyRadius);
  document.getElementById("radius-center").addEventListener("change", updatePreviewCircles);
  document.getElementById("radius-step").addEventListener("change", updatePreviewCircles);
  document.getElementById("radius-max").addEventListener("change", updatePreviewCircles);
}

function applyRadius() {
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
  const names = [];
  for (let i = 1; i <= numZones; i++) names.push("Sone " + i);
  zones.resetGroups(names);

  const counts = new Array(numZones).fill(0);
  let outsideCount = 0;

  for (const item of allPostnrs) {
    const c = getCentroid(item.layer);
    const dist = haversineKm(center.lat, center.lng, c.lat, c.lng);
    const band = Math.floor(dist / stepKm);
    if (band < numZones) {
      zones.add(item.postnr, "Sone " + (band + 1));
      counts[band]++;
    } else if (collectRest) {
      zones.add(item.postnr, "Sone " + numZones);
      counts[numZones - 1]++;
    } else {
      outsideCount++;
    }
  }

  const preview = document.getElementById("radius-preview");
  preview.innerHTML = "";
  for (let i = 0; i < numZones; i++) {
    const from = i * stepKm;
    const to = (i + 1) * stepKm;
    const isLast = (i === numZones - 1) && collectRest;
    const div = document.createElement("div");
    div.className = "preview-band";
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

  zones.active = "Sone 1";
  repaintAll();
  persist();
  refreshUI();
  map.setView([center.lat, center.lng], 8);
}

function updatePreviewCircles() {
  for (const c of radiusCircles) map.removeLayer(c);
  radiusCircles = [];
  const centerPnr = document.getElementById("radius-center").value.trim();
  const stepKm = parseFloat(document.getElementById("radius-step").value);
  const numZones = parseInt(document.getElementById("radius-max").value, 10);
  if (!centerPnr || !featureIndex[centerPnr] || isNaN(stepKm) || isNaN(numZones)) return;
  const center = getCentroid(featureIndex[centerPnr]);
  for (let i = 1; i <= numZones; i++) {
    radiusCircles.push(
      L.circle([center.lat, center.lng], {
        radius: i * stepKm * 1000,
        color: ZONE_COLORS[(i - 1) % ZONE_COLORS.length],
        weight: 1.5, dashArray: "6 4", fill: false, interactive: false,
      }).addTo(map)
    );
  }
}
