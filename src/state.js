import { createZoneManager, createRouteManager } from "./groups.js";

const LS_KEY = "postnummer_app_v2";

export const zones = createZoneManager();
export const routes = createRouteManager();
export let activeTab = "soner";

export function setActiveTab(tab) {
  activeTab = tab;
}

export function getManager() {
  return activeTab === "soner" ? zones : routes;
}

export function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      zones: zones.toJSON(),
      routes: routes.toJSON(),
      activeTab,
    }));
  } catch (_) {}
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.zones) zones.loadJSON(s.zones);
    if (s.routes) routes.loadJSON(s.routes);
    if (s.activeTab) activeTab = s.activeTab;
  } catch (_) {}
}
