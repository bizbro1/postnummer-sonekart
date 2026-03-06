import { map, allPostnrs, getDrawMode, setDrawMode } from "./map.js";
import { DRAW_STYLE } from "./constants.js";
import { getCentroid, pointInPolygon } from "./geo.js";

let drawOrigin = null;
let drawPreview = null;
let lassoPoints = [];
let lassoPolyline = null;
let lassoDrawing = false;
let onSelectCallback = null;

const mapEl = document.getElementById("map");
const cancelBtn = document.getElementById("draw-cancel");

export function initDraw(onSelect) {
  onSelectCallback = onSelect;

  document.querySelectorAll(".draw-btn[data-tool]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (getDrawMode() === btn.dataset.tool) exitDrawMode();
      else enterDrawMode(btn.dataset.tool);
    });
  });

  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exitDrawMode();
  });
}

function enterDrawMode(tool) {
  exitDrawMode();
  setDrawMode(tool);
  mapEl.classList.add("draw-mode");
  map.dragging.disable();
  map.doubleClickZoom.disable();
  cancelBtn.classList.remove("hidden");
  document.querySelectorAll(".draw-btn[data-tool]").forEach((b) =>
    b.classList.toggle("active", b.dataset.tool === tool)
  );
  map.on("mousedown", onMouseDown);
  map.on("mousemove", onMouseMove);
  map.on("mouseup", onMouseUp);
}

function exitDrawMode() {
  setDrawMode(null);
  drawOrigin = null;
  lassoPoints = [];
  lassoDrawing = false;
  mapEl.classList.remove("draw-mode");
  map.dragging.enable();
  map.doubleClickZoom.enable();
  cancelBtn.classList.add("hidden");
  document.querySelectorAll(".draw-btn[data-tool]").forEach((b) => b.classList.remove("active"));
  if (drawPreview) { map.removeLayer(drawPreview); drawPreview = null; }
  if (lassoPolyline) { map.removeLayer(lassoPolyline); lassoPolyline = null; }
  map.off("mousedown", onMouseDown);
  map.off("mousemove", onMouseMove);
  map.off("mouseup", onMouseUp);
}

function onMouseDown(e) {
  const mode = getDrawMode();
  if (mode === "lasso") {
    lassoDrawing = true;
    lassoPoints = [e.latlng];
    if (lassoPolyline) { map.removeLayer(lassoPolyline); lassoPolyline = null; }
    return;
  }
  drawOrigin = e.latlng;
  if (drawPreview) { map.removeLayer(drawPreview); drawPreview = null; }
}

function onMouseMove(e) {
  const mode = getDrawMode();
  if (mode === "lasso" && lassoDrawing) {
    lassoPoints.push(e.latlng);
    if (lassoPolyline) map.removeLayer(lassoPolyline);
    lassoPolyline = L.polyline(lassoPoints, { color: "#e74c3c", weight: 2.5, interactive: false }).addTo(map);
    return;
  }
  if (!drawOrigin) return;
  if (drawPreview) map.removeLayer(drawPreview);
  if (mode === "circle") {
    drawPreview = L.circle(drawOrigin, { radius: drawOrigin.distanceTo(e.latlng), ...DRAW_STYLE }).addTo(map);
  } else if (mode === "rect") {
    drawPreview = L.rectangle([drawOrigin, e.latlng], DRAW_STYLE).addTo(map);
  }
}

function onMouseUp(e) {
  const mode = getDrawMode();
  if (mode === "lasso" && lassoDrawing) {
    lassoDrawing = false;
    if (lassoPoints.length < 10) { lassoPoints = []; return; }
    lassoPoints.push(lassoPoints[0]);
    if (lassoPolyline) { map.removeLayer(lassoPolyline); lassoPolyline = null; }
    const polygon = L.polygon(lassoPoints, { ...DRAW_STYLE, dashArray: null }).addTo(map);
    selectInsideLasso(lassoPoints);
    setTimeout(() => map.removeLayer(polygon), 800);
    exitDrawMode();
    return;
  }
  if (!drawOrigin) return;
  if (mode === "circle") {
    const radius = drawOrigin.distanceTo(e.latlng);
    if (radius < 100) { drawOrigin = null; return; }
    selectInsideCircle(drawOrigin, radius);
  } else if (mode === "rect") {
    const bounds = L.latLngBounds(drawOrigin, e.latlng);
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) { drawOrigin = null; return; }
    selectInsideRect(bounds);
  }
  drawOrigin = null;
  setTimeout(() => { if (drawPreview) { map.removeLayer(drawPreview); drawPreview = null; } }, 600);
  exitDrawMode();
}

function selectInsideCircle(center, radiusMeters) {
  const selected = [];
  for (const item of allPostnrs) {
    const c = getCentroid(item.layer);
    if (center.distanceTo(L.latLng(c.lat, c.lng)) <= radiusMeters) selected.push(item.postnr);
  }
  if (onSelectCallback) onSelectCallback(selected);
}

function selectInsideRect(bounds) {
  const selected = [];
  for (const item of allPostnrs) {
    const c = getCentroid(item.layer);
    if (bounds.contains(L.latLng(c.lat, c.lng))) selected.push(item.postnr);
  }
  if (onSelectCallback) onSelectCallback(selected);
}

function selectInsideLasso(latlngs) {
  const poly = latlngs.map((ll) => [ll.lat, ll.lng]);
  const selected = [];
  for (const item of allPostnrs) {
    const c = getCentroid(item.layer);
    if (pointInPolygon([c.lat, c.lng], poly)) selected.push(item.postnr);
  }
  if (onSelectCallback) onSelectCallback(selected);
}
