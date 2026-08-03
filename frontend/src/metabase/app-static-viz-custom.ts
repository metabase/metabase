import "metabase/static-viz/polyfill";

import {
  clearCustomVizRegistrations,
  initializeContext,
  registerCustomVizPluginFromGlobal,
  renderChart,
} from "metabase/static-viz/index-custom";

export function renderChartJSON(inputJSON: string): string {
  return JSON.stringify(renderChart(JSON.parse(inputJSON)));
}

export function initializeContextJSON(optionsJSON: string): void {
  initializeContext(JSON.parse(optionsJSON));
  clearCustomVizRegistrations();
}

/**
 * Register a custom viz plugin whose bundle the backend has just evaluated
 * in this context (see registerCustomVizPluginFromGlobal). Call
 * initializeContextJSON first so the EE registry override and site locale
 * are in place.
 */
export const registerCustomVizPlugin = registerCustomVizPluginFromGlobal;
