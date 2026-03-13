import "./styles.css";
import { initMap, loadGeoJSON, repaintAll } from "./map.js";
import { loadFromStorage } from "./state.js";
import { initOrderPage } from "./orderPage.js";

const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");

function hideLoading() {
  loadingOverlay.classList.add("hidden");
  setTimeout(() => { loadingOverlay.style.display = "none"; }, 500);
}

initMap();

loadGeoJSON("./data/postnummeromrader-prepared.geojson", (msg) => {
  loadingText.textContent = msg;
})
  .then(() => {
    loadFromStorage();
    repaintAll();
    initOrderPage();
    hideLoading();
  })
  .catch((err) => {
    hideLoading();
    console.error(err);
  });
