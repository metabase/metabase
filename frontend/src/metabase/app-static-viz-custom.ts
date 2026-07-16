import "metabase/static-viz/polyfill";

import {
  initializeContext,
  registerCustomVizPlugin as registerPlugin,
  renderChart,
} from "metabase/static-viz/index-custom";

type CustomVizPluginFactory = Parameters<typeof registerPlugin>[0];

// Entry for the slim custom-viz-only static-viz bundle loaded into the untrusted
// plugin isolate. Like ../app-static-viz.ts it exposes a JSON-string API on the
// `MetabaseStaticViz` global (each isolate loads exactly one of the two bundles),
// plus the two plugin-registration hooks the custom-viz render path calls before
// rendering — see metabase.channel.render.js.graal/render-custom-viz.

export function renderChartJSON(inputJSON: string): string {
  return JSON.stringify(renderChart(JSON.parse(inputJSON)));
}

export function initializeContextJSON(optionsJSON: string): void {
  initializeContext(JSON.parse(optionsJSON));
}

/**
 * Register the plugin bundle that was just evaluated into this isolate. Plugin
 * bundles are built as IIFEs that define the `__customVizPlugin__` global (see
 * the metabaseVizExternals Vite plugin in enterprise/frontend/src/custom-viz).
 */
export function registerCustomVizPlugin(identifier: string): void {
  const factory =
    // Cast: `__customVizPlugin__` is defined by the plugin IIFE evaluated into
    // this isolate at runtime; it isn't part of any ambient global type here.
    (globalThis as { __customVizPlugin__?: CustomVizPluginFactory })
      .__customVizPlugin__;
  if (typeof factory === "function") {
    registerPlugin(factory, identifier);
  }
}
