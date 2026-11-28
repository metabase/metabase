import {
  type ChartElementTarget,
  getChartRoot,
} from "__support__/echarts-interaction";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  DatasetColumn,
  RowValue,
  SingleSeries,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

export const GREEN = "#88BF4D";
export const PURPLE = "#A989C5";
export const BLUE = "#509EE3";
export const TEAL = "#98D9D9";
export const YELLOW = "#F9D45C";

export function createDateColumn(
  name: string,
  unit: DatasetColumn["unit"],
): DatasetColumn {
  return createMockColumn({
    name,
    display_name: `Created At: ${unit}`,
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    source: "breakout",
    unit,
  });
}

export function createMetricColumn(
  name: string,
  displayName: string,
  baseType = "type/Float",
): DatasetColumn {
  return createMockColumn({
    name,
    display_name: displayName,
    base_type: baseType,
    effective_type: baseType,
    source: "aggregation",
  });
}

export function createNativeColumn(
  name: string,
  baseType: string,
): DatasetColumn {
  return createMockColumn({
    name,
    display_name: name,
    base_type: baseType,
    effective_type: baseType,
    source: "native",
    field_ref: ["field", name, { "base-type": baseType }],
  });
}

interface SeriesOpts {
  id?: number;
  name?: string;
  display?: VisualizationDisplay;
  cols: DatasetColumn[];
  rows: RowValue[][];
  settings?: VisualizationSettings;
  /** The time zone that the backend sends dates in */
  resultsTimezone?: string;
}

export function createSeries({
  id = 1,
  name = "Q1",
  display = "line",
  cols,
  rows,
  settings = {},
  resultsTimezone = "US/Pacific",
}: SeriesOpts): SingleSeries {
  return {
    card: createMockCard({
      id,
      name,
      display,
      visualization_settings: {
        "graph.dimensions": [cols[0].name],
        "graph.metrics": cols.slice(1).map((col) => col.name),
        ...settings,
      },
    }),
    data: createMockDatasetData({
      cols,
      rows,
      results_timezone: resultsTimezone,
    }),
  };
}

interface SetupChartOpts {
  rawSeries: SingleSeries[];
  /** Dashboards and the query builder let users hide series in the legend */
  canToggleSeriesVisibility?: boolean;
}

/** Renders the series as a dashboard card does, and returns the chart root */
export async function setupChart({
  rawSeries,
  canToggleSeriesVisibility = false,
}: SetupChartOpts) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  renderWithProviders(
    <Visualization
      isDashboard
      rawSeries={rawSeries}
      canToggleSeriesVisibility={canToggleSeriesVisibility}
    />,
    { storeInitialState: { settings: mockSettings() } },
  );
  // the chart draws its series once it is measured
  await waitFor(() =>
    expect(
      screen.getByTestId("chart-container").querySelector("svg path"),
    ).not.toBeNull(),
  );
  return getChartRoot();
}

export const point = (color: string, index: number): ChartElementTarget => ({
  type: "path",
  color,
  index,
});

export const bar = (color: string, index: number): ChartElementTarget => ({
  type: "rect",
  color,
  index,
});
