import "metabase/static-viz/polyfill";

import {
  clearCustomVizRegistrations,
  getCellBackgroundColors,
  initializeContext,
  registerCustomVizPluginFromGlobal,
  renderChart,
} from "metabase/static-viz";

export function renderChartJSON(inputJSON: string): string {
  return JSON.stringify(renderChart(JSON.parse(inputJSON)));
}

export function getCellBackgroundColorsJSON(inputJSON: string): string {
  return JSON.stringify(getCellBackgroundColors(JSON.parse(inputJSON)));
}

export function initializeContextJSON(optionsJSON: string): void {
  initializeContext(JSON.parse(optionsJSON));
  clearCustomVizRegistrations();
}

export const registerCustomVizPlugin = registerCustomVizPluginFromGlobal;
