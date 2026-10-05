import { registerVisualizations } from "metabase/visualizations/register";
import { PIE_CHART_DEFINITION } from "metabase/visualizations/visualizations/PieChart/definition";
import { getComputedSettingsForSeries } from "metabase/viz-core";
import type {
  RawSeries,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

const ROWS = 200;

/**
 * `pie.metric` and `pie.dimension` are absent, so getPieRows returns early with
 * an empty array. That keeps these tests about the cache rather than about the
 * row computation, which pie.unit.spec covers.
 */
const NO_SETTINGS = {};

function readPieRows(series: RawSeries): unknown {
  const getValue = PIE_CHART_DEFINITION.settings?.["pie.rows"]?.getValue;
  if (getValue == null) {
    throw new Error(
      "PIE_CHART_DEFINITION no longer exposes a pie.rows getValue",
    );
  }
  return getValue(series, NO_SETTINGS);
}

function makeSeries(): RawSeries {
  const rows: RowValues[] = Array.from({ length: ROWS }, (_, index) => [
    `category ${index}`,
    index,
  ]);

  return [
    {
      card: createMockCard(),
      data: createMockDatasetData({
        rows,
        cols: [
          createMockColumn({ name: "category", display_name: "Category" }),
          createMockColumn({ name: "count", display_name: "Count" }),
        ],
      }),
    },
  ];
}

describe("PieChart pie.rows caching", () => {
  it("reuses the result for the same dataset and settings", () => {
    const series = makeSeries();

    expect(readPieRows(series)).toBe(readPieRows(series));
  });

  it("recomputes for a deep-equal but separate dataset", () => {
    const series = makeSeries();
    const rebuilt: RawSeries = JSON.parse(JSON.stringify(series));

    expect(readPieRows(rebuilt)).not.toBe(readPieRows(series));
  });
});

describe("PieChart legend.is_visible", () => {
  registerVisualizations();

  const computeLegend = (settings: VisualizationSettings) =>
    getComputedSettingsForSeries([
      {
        ...makeSeries()[0],
        card: createMockCard({
          display: "pie",
          visualization_settings: settings,
        }),
      },
    ])["legend.is_visible"];

  it("shows the legend by default", () => {
    expect(computeLegend({})).toBe(true);
  });

  it("honors a card saved with pie.show_legend", () => {
    expect(computeLegend({ "pie.show_legend": false })).toBe(false);
  });

  it("prefers legend.is_visible over pie.show_legend", () => {
    expect(
      computeLegend({ "pie.show_legend": false, "legend.is_visible": true }),
    ).toBe(true);
  });
});
