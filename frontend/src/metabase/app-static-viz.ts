import "metabase/static-viz/polyfill";

import enterpriseOverrides from "ee-overrides";
import {
  clearCustomVizRegistrations,
  getCellBackgroundColors,
  initializeContext,
  registerCustomVizPluginFromGlobal,
  renderChart,
} from "metabase/static-viz";

export function renderChartJSON(inputJSON: string): string {
  return JSON.stringify(
    renderChart(JSON.parse(inputJSON), enterpriseOverrides),
  );
}

export function getCellBackgroundColorsJSON(inputJSON: string): string {
  return JSON.stringify(getCellBackgroundColors(JSON.parse(inputJSON)));
}

export function initializeContextJSON(optionsJSON: string): void {
  initializeContext(JSON.parse(optionsJSON), enterpriseOverrides);
  clearCustomVizRegistrations();
}

export const registerCustomVizPlugin = registerCustomVizPluginFromGlobal;
