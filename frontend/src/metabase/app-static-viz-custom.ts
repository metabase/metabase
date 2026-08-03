import "metabase/static-viz/polyfill";

import enterpriseOverrides from "ee-overrides";
import {
  clearCustomVizRegistrations,
  initializeContext,
  registerCustomVizPluginFromGlobal,
  renderChart,
} from "metabase/static-viz/index-custom";

export function renderChartJSON(inputJSON: string): string {
  return JSON.stringify(
    renderChart(JSON.parse(inputJSON), enterpriseOverrides),
  );
}

export function initializeContextJSON(optionsJSON: string): void {
  initializeContext(JSON.parse(optionsJSON), enterpriseOverrides);
  clearCustomVizRegistrations();
}

export const registerCustomVizPlugin = registerCustomVizPluginFromGlobal;
