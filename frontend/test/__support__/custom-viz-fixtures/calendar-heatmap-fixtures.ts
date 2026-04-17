import { useEffect, useState } from "react";

import { DateTimeColumn, NumberColumn } from "__support__/visualizations";
import { getCustomPluginIdentifier } from "metabase-enterprise/custom_viz/custom-viz-plugins";
import type { RowValues, VisualizationDisplay } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import { registerCustomVizPluginForStorybook } from "./register-for-storybook";

export const PLUGIN_BASE_URL = "/custom-viz-fixtures/calendar-heatmap";
export const PLUGIN_IDENTIFIER = "calendar-heatmap";
export const HEATMAP_DISPLAY = getCustomPluginIdentifier(
  PLUGIN_IDENTIFIER,
) as VisualizationDisplay;

export const HEATMAP_COLS = [
  createMockColumn(DateTimeColumn({ name: "date", display_name: "Date" })),
  createMockColumn(NumberColumn({ name: "value", display_name: "Value" })),
];

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function buildYearData(year: number): RowValues[] {
  const rows: RowValues[] = [];
  const start = new Date(Date.UTC(year, 0, 1));
  const days = isLeapYear(year) ? 366 : 365;
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const value = Math.round(60 + 40 * Math.sin(i / 9) + 20 * Math.cos(i / 37));
    rows.push([iso, value]);
  }
  return rows;
}

export const HEATMAP_ROWS = buildYearData(2026);

/**
 * Milliseconds to wait between `useHeatmapPlugin()` flipping ready and
 * signalling Loki to snapshot. Covers ExplicitSize's re-render, the plugin's
 * `echarts.init` + first `setOption`, and echarts' ~1000ms first-draw
 * animation. Anything below ~1000ms risks catching a mid-animation frame;
 * 1500ms is a safe upper bound that also absorbs the MSW card-query fetch
 * the document story performs.
 */
export const HEATMAP_SNAPSHOT_DELAY_MS = 1500;

/**
 * Kicks off the async bundle fetch + register and flips `ready` to true when
 * the plugin is available in the visualization registry.
 */
export function useHeatmapPlugin() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    registerCustomVizPluginForStorybook({
      bundleUrl: `${PLUGIN_BASE_URL}/index.js`,
      displayName: "Calendar Heatmap",
      identifier: PLUGIN_IDENTIFIER,
      iconUrl: `${PLUGIN_BASE_URL}/assets/calendar.svg`,
      assetBaseUrl: `${PLUGIN_BASE_URL}/assets`,
    }).then(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}
