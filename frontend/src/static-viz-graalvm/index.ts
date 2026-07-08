import "metabase/static-viz/polyfill";

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
