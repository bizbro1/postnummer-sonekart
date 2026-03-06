import "./styles.css";
import { initMap, loadGeoJSON, setOnClick, applyStyle, repaintAll } from "./map.js";
import { zones, routes, activeTab, loadFromStorage, persist, getManager } from "./state.js";
import { initUI, refreshUI, syncTabUI } from "./ui.js";
import { initDraw } from "./draw.js";
import { initRadius } from "./radius.js";
import { initOrderUI } from "./orderUI.js";

const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");

function hideLoading() {
  loadingOverlay.classList.add("hidden");
  setTimeout(() => { loadingOverlay.style.display = "none"; }, 500);
}

initMap();

setOnClick((postnr) => {
  const mgr = getManager();
  mgr.toggle(postnr);
  applyStyle(postnr);
  persist();
  refreshUI();
});

initDraw((selectedList) => {
  const mgr = getManager();
  for (const pnr of selectedList) {
    if (!mgr.lookup[pnr]) {
      mgr.add(pnr, mgr.active);
      applyStyle(pnr);
    }
  }
  persist();
  refreshUI();
});

initUI();
initRadius();
initOrderUI();

loadGeoJSON("./data/postnummeromrader-prepared.geojson", (msg) => {
  loadingText.textContent = msg;
})
  .then(() => {
    loadFromStorage();
    syncTabUI();
    repaintAll();
    refreshUI();
    hideLoading();
  })
  .catch((err) => {
    hideLoading();
    document.getElementById("status-total-soner").textContent = "Feil: " + err.message;
    console.error(err);
  });
