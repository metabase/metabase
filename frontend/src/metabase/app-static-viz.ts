import "metabase/static-viz/polyfill";
import { getCellBackgroundColors, renderChart } from "metabase/static-viz";

export function renderChartJSON(inputJSON: string): string {
  return JSON.stringify(renderChart(JSON.parse(inputJSON)));
}

export function getCellBackgroundColorsJSON(inputJSON: string): string {
  return JSON.stringify(getCellBackgroundColors(JSON.parse(inputJSON)));
}
