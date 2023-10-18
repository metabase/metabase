import { createMockCard } from "metabase-types/api/mocks";
import type { RawSeries } from "metabase-types/api";
import { computeStaticPieChartSettings } from "./setttings";

const MOCK_COLS = [
  {
    name: "CATEGORY",
    source: "breakout",
    display_name: "Category",
  },
  {
    name: "count",
    display_name: "Count",
    source: "aggregation",
    effective_type: "type/BigInteger",
  },
];

const MOCK_ROWS = [
  ["Doohickey", 42],
  ["Gadget", 53],
  ["Gizmo", 51],
  ["Widget", 54],
];

const MOCK_RAW_SERIES: RawSeries = [
  {
    card: createMockCard(),
    data: {
      cols: MOCK_COLS,
      rows: MOCK_ROWS,
      rows_truncated: 0,
      results_metadata: {
        columns: MOCK_COLS,
      },
    },
  },
];

const DEFAULT_SETTINGS = {
  "pie.dimension": "CATEGORY",
  "pie.metric": "count",
  "pie.show_legend": true,
  "pie.show_total": true,
  "pie.percent_visibility": "legend",
  "pie.slice_threshold": 2.5,
  "pie.colors": {
    Doohickey: "#88BF4D",
    Gadget: "#F9D45C",
    Gizmo: "#A989C5",
    Widget: "#F2A86F",
  },
};

const STORED_SETTINGS = {
  "pie.dimension": "DIMENSION",
  "pie.metric": "metric",
  "pie.show_legend": false,
  "pie.show_total": false,
  "pie.percent_visibility": "off" as const,
  "pie.slice_threshold": 5,
  "pie.colors": {
    Doohickey: "#e68a76",
    Gadget: "#76e696",
    Gizmo: "#525de1",
    Widget: "#dc52e1",
  },
};

describe("computeStaticPieChartSettings", () => {
  it("should replace empty values in stored settings with defaults", () => {
    const { column, ...computedSettings } =
      computeStaticPieChartSettings(MOCK_RAW_SERIES);

    expect(typeof column).toBe("function");
    expect(computedSettings).toStrictEqual(DEFAULT_SETTINGS);
  });

  it("should not replace non-empty values in stored settings", () => {
    const rawSeries = [{ ...MOCK_RAW_SERIES[0] }];
    rawSeries[0].card.visualization_settings = { ...STORED_SETTINGS };

    const { column, ...computedSettings } =
      computeStaticPieChartSettings(rawSeries);

    expect(typeof column).toBe("function");
    expect(computedSettings).toStrictEqual(STORED_SETTINGS);
  });
});
