import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import registerVisualizations from "metabase/visualizations/register";
import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

registerVisualizations();

// Regression witness for metabase#43538.
//
// A bar chart with `stackable.stack_type: "normalized"` retains that stored
// setting when the user switches the display to a line chart. Line charts are
// not stackable, so the normalized value must be reset — otherwise the line
// chart's Y-axis renders as a 0-100% scale.
//
// The fix added STACKABLE_SETTINGS to the line chart's settings definitions
// (via COMBO_CHARTS_SETTINGS_DEFINITIONS). With that definition present,
// computing settings for a line series runs the `stackable.stack_type`
// isValid/getDefault logic: `normalized` is invalid for non-stackable series,
// so it falls back to the default (`null`). Without the definition, the stored
// `normalized` leaks through into the computed settings.

const dimension = createMockColumn({
  name: "CREATED_AT",
  display_name: "Created At",
  base_type: "type/DateTime",
  source: "breakout",
});
const seriesColumn = createMockColumn({
  name: "CATEGORY",
  display_name: "Category",
  base_type: "type/Text",
  source: "breakout",
});
const metric = createMockColumn({
  name: "avg",
  display_name: "Average of Price",
  base_type: "type/Float",
  source: "aggregation",
});

const lineSeriesWithNormalizedStacking: RawSeries = [
  {
    card: createMockCard({
      id: 1,
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "CATEGORY"],
        "graph.metrics": ["avg"],
        // carried over from the bar chart the user switched away from
        "stackable.stack_type": "normalized",
      },
    }),
    data: createMockDatasetData({
      cols: [dimension, seriesColumn, metric],
      rows: [
        ["2020-01-01", "Widget", 3],
        ["2020-01-01", "Gadget", 5],
        ["2021-01-01", "Widget", 4],
        ["2021-01-01", "Gadget", 6],
      ],
    }),
  },
];

describe("line chart stacking (metabase#43538)", () => {
  it("resets a carried-over normalized stack_type when the display is line", () => {
    const settings = getComputedSettingsForSeries(
      lineSeriesWithNormalizedStacking,
    );

    expect(settings["stackable.stack_type"]).toBe(null);
  });
});
