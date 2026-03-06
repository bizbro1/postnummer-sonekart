import { getManager } from "./state.js";
import { DEFAULT_STYLE, POSTNR_KEYS, POSTSTED_KEYS, postnrMap } from "./constants.js";

function findAttr(props, candidates) {
  for (const key of candidates) {
    if (props[key] !== undefined && props[key] !== null) return String(props[key]);
  }
  return null;
}

export const featureIndex = {};   // postnr → Leaflet layer
export const allPostnrs = [];     // [{postnr, poststed, layer}]

export let map;
export let geoLayer;

let drawMode = null;
let onClickCallback = null;

export function initMap() {
  map = L.map("map", { zoomControl: true }).setView([64.5, 14.0], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

export function setDrawMode(mode) { drawMode = mode; }
export function getDrawMode() { return drawMode; }

export function setOnClick(fn) { onClickCallback = fn; }

export function selectedStyle(color) {
  return { color, weight: 2.5, opacity: 0.9, fillColor: color, fillOpacity: 0.45 };
}

export function applyStyle(postnr) {
  const layer = featureIndex[postnr];
  if (!layer) return;
  const mgr = getManager();
  if (mgr.lookup[postnr]) {
    layer.setStyle(selectedStyle(mgr.color(mgr.lookup[postnr])));
  } else {
    layer.setStyle(DEFAULT_STYLE);
  }
}

export function repaintAll() {
  for (const item of allPostnrs) applyStyle(item.postnr);
}

export function loadGeoJSON(url, onProgress) {
  onProgress("Laster postnummerområder...");
  return fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error("Kunne ikke laste GeoJSON.");
      onProgress("Parser GeoJSON...");
      return r.json();
    })
    .then((data) => {
      onProgress("Tegner polygoner...");
      const fc = data.type === "FeatureCollection" ? data : data;

      geoLayer = L.geoJSON(fc, {
        style: () => DEFAULT_STYLE,
        onEachFeature(feature, layer) {
          const props = feature.properties || {};
          const postnr = findAttr(props, POSTNR_KEYS);
          const poststed = findAttr(props, POSTSTED_KEYS);
          if (!postnr) return;
          featureIndex[postnr] = layer;
          const entry = { postnr, poststed: poststed || "", layer };
          allPostnrs.push(entry);
          postnrMap.set(postnr, entry);
          layer.on("click", () => {
            if (drawMode) return;
            if (onClickCallback) onClickCallback(postnr);
          });
          layer.bindTooltip(postnr + (poststed ? " " + poststed : ""), {
            sticky: true,
          });
        },
      }).addTo(map);

      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    });
}

export function zoomToPostnr(postnr) {
  const layer = featureIndex[postnr];
  if (layer) {
    map.fitBounds(layer.getBounds(), { maxZoom: 14, padding: [40, 40] });
    layer.openTooltip();
  }
}
