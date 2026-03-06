/**
 * Pre-processes the raw Geonorge GeoJSON file:
 *  1) Extracts the nested FeatureCollection
 *  2) Reprojects EPSG:25833 (UTM 33N) → WGS84 (EPSG:4326)
 *  3) Simplifies polygon coordinates (reduces precision)
 *  4) Strips unnecessary attributes
 *  5) Pre-computes centroids
 *  6) Writes a compact output file (~5-15 MB instead of 100+ MB)
 *
 * Usage:  node scripts/prepare-data.js
 */

import { readFileSync, writeFileSync } from "fs";
import proj4 from "proj4";

proj4.defs("EPSG:25833", "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
const toWGS84 = proj4("EPSG:25833", "EPSG:4326");

const INPUT = "./data/postnummeromrader.geojson";
const OUTPUT = "./data/postnummeromrader-prepared.geojson";
const CENTROID_OUTPUT = "./data/centroids.json";
const PRECISION = 5; // ~1m accuracy at this latitude

console.log("Reading raw GeoJSON...");
const raw = JSON.parse(readFileSync(INPUT, "utf-8"));

const fc = raw.type === "FeatureCollection"
  ? raw
  : Object.values(raw).find((v) => v && v.type === "FeatureCollection");

if (!fc) { console.error("No FeatureCollection found."); process.exit(1); }

const needsReproject = fc.crs?.properties?.name === "EPSG:25833" ||
  isUTM(fc.features[0]?.geometry?.coordinates);

console.log(`Found ${fc.features.length} features. Reproject: ${needsReproject}`);

const centroids = {};
const features = [];

for (const f of fc.features) {
  const postnummer = f.properties?.postnummer || f.properties?.POSTNUMMER;
  const poststed = f.properties?.poststed || f.properties?.POSTSTED;
  if (!postnummer) continue;

  if (needsReproject) reprojectCoords(f.geometry.coordinates);
  roundCoords(f.geometry.coordinates, PRECISION);

  const centroid = computeCentroid(f.geometry.coordinates);
  centroids[postnummer] = [
    round(centroid[0], PRECISION),
    round(centroid[1], PRECISION),
  ];

  features.push({
    type: "Feature",
    properties: { postnummer, poststed: poststed || "" },
    geometry: f.geometry,
  });
}

console.log(`Processed ${features.length} postal areas.`);

const output = { type: "FeatureCollection", features };
const json = JSON.stringify(output);
writeFileSync(OUTPUT, json);
console.log(`Wrote ${OUTPUT} (${(Buffer.byteLength(json) / 1024 / 1024).toFixed(1)} MB)`);

const centroidJson = JSON.stringify(centroids);
writeFileSync(CENTROID_OUTPUT, centroidJson);
console.log(`Wrote ${CENTROID_OUTPUT} (${(Buffer.byteLength(centroidJson) / 1024).toFixed(0)} KB)`);

// ─── Helpers ──────────────────────────────────────────────────

function reprojectCoords(coords) {
  if (typeof coords[0] === "number") {
    const [lng, lat] = toWGS84.forward(coords);
    coords[0] = lng;
    coords[1] = lat;
  } else {
    for (const c of coords) reprojectCoords(c);
  }
}

function roundCoords(coords, precision) {
  if (typeof coords[0] === "number") {
    coords[0] = round(coords[0], precision);
    coords[1] = round(coords[1], precision);
  } else {
    for (const c of coords) roundCoords(c, precision);
  }
}

function round(n, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function computeCentroid(coords) {
  const flat = [];
  flattenCoords(coords, flat);
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of flat) { sumLng += lng; sumLat += lat; }
  return [sumLng / flat.length, sumLat / flat.length];
}

function flattenCoords(coords, out) {
  if (typeof coords[0] === "number") {
    out.push(coords);
  } else {
    for (const c of coords) flattenCoords(c, out);
  }
}

function isUTM(coords) {
  try {
    const flat = [];
    flattenCoords(coords, flat);
    return flat[0] && (Math.abs(flat[0][0]) > 180 || Math.abs(flat[0][1]) > 180);
  } catch { return false; }
}
