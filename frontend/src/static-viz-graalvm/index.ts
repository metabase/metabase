// GraalVM entry point for static-viz. GraalVM loads this UMD bundle and calls the exports as
// `MetabaseStaticViz.<fn>(jsonString)`, reading a string back — so each export is a thin JSON adapter
// over the typed functions in metabase/static-viz. The environment shim (a browser-like set of
// globals) and the TextEncoder polyfill are installed here, before the rendering code loads, since
// GraalVM provides neither.
import "./environment";
import "fast-text-encoding";

import {
  getCellBackgroundColors as getCellBackgroundColorsImpl,
  renderChart as renderChartImpl,
} from "metabase/static-viz";

export function renderChart(inputJSON: string): string {
  return JSON.stringify(renderChartImpl(JSON.parse(inputJSON)));
}

export function getCellBackgroundColors(inputJSON: string): string {
  return JSON.stringify(getCellBackgroundColorsImpl(JSON.parse(inputJSON)));
}
