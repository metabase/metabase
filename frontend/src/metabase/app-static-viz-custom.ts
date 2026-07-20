import "metabase/static-viz/polyfill";

import {
  initializeContext,
  registerCustomVizPlugin as registerCustomVizPluginImpl,
  renderChart,
} from "metabase/static-viz/index-custom";
import type { CustomVizPluginId } from "metabase-types/api";

// Entry for the slim custom-viz-only static-viz bundle loaded into the untrusted
// plugin isolate. Like ./app-static-viz.ts it exposes a JSON-string API on the
// `MetabaseStaticViz` global - each isolate loads exactly one of the two bundles -
// minus the calls only the trusted pool makes (legacy funnel/gauge, cell colors).

export function renderChartJSON(inputJSON: string): string {
  return JSON.stringify(renderChart(JSON.parse(inputJSON)));
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
  // The plugin bundle assigns this global at eval time, so it isn't part of
  // the typed global scope in the GraalJS context.
  const globals = globalThis as {
    __customVizPlugin__?: Parameters<typeof registerCustomVizPluginImpl>[0];
  };
  const factory = globals.__customVizPlugin__;
  globals.__customVizPlugin__ = undefined;
  if (typeof factory === "function") {
    registerCustomVizPluginImpl(factory, identifier, pluginId);
  }
}
