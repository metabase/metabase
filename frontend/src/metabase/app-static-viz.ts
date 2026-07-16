import "metabase/static-viz/polyfill";

import {
  getCellBackgroundColors,
  initializeContext,
  registerCustomVizPlugin as registerCustomVizPluginImpl,
  renderChart,
} from "metabase/static-viz";
import type { CustomVizPluginId } from "metabase-types/api";

export function renderChartJSON(inputJSON: string): string {
  return JSON.stringify(renderChart(JSON.parse(inputJSON)));
}

export function getCellBackgroundColorsJSON(inputJSON: string): string {
  return JSON.stringify(getCellBackgroundColors(JSON.parse(inputJSON)));
}

export function initializeContextJSON(optionsJSON: string): void {
  initializeContext(JSON.parse(optionsJSON));
}

/**
 * Register a custom viz plugin whose bundle the backend has just evaluated
 * in this context. The bundle is a Vite IIFE that assigns its factory to the
 * `__customVizPlugin__` global. Call initializeContextJSON first so the EE
 * registry override and site locale are in place.
 */
export function registerCustomVizPlugin(
  identifier: string,
  pluginId: CustomVizPluginId,
): void {
  const factory =
    // The plugin bundle assigns its factory to a global; globalThis carries no
    // type information for it.
    (
      globalThis as {
        __customVizPlugin__?: Parameters<typeof registerCustomVizPluginImpl>[0];
      }
    ).__customVizPlugin__;
  if (typeof factory === "function") {
    registerCustomVizPluginImpl(factory, identifier, pluginId);
  }
}
