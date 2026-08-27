/* eslint-disable testing-library/render-result-naming-convention --
   These tests use ReactDOMServer.renderToStaticMarkup (a server-side string render), not an RTL
   render, so the "view"/"utils" naming convention doesn't apply. */
import ReactDOMServer from "react-dom/server";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { RowValues, VisualizationSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { StaticVisualization } from "../StaticVisualization";

const renderingContext = createStaticRenderingContext();

const COLS = [
  createMockColumn({
    name: "Date",
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    source: "breakout",
  }),
  createMockColumn({
    name: "Count",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    source: "aggregation",
  }),
];

const INSIGHTS = [
  {
    unit: "month" as const,
    col: "Count",
    offset: 0,
    slope: 0,
    "last-change": 0,
    "previous-value": 0,
    "last-value": 0,
  },
];

const ROWS: RowValues[] = [
  ["2019-10-01", 300],
  ["2019-11-01", 310],
];

const ROWS_WITH_MISSING_VALUE: RowValues[] = [
  ["2019-10-01", null],
  ["2019-11-01", 310],
];

const toMarkup = (rows: RowValues[], settings: VisualizationSettings = {}) =>
  ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization
      rawSeries={[
        createMockSingleSeries(
          {
            display: "smartscalar",
            visualization_settings: {
              "scalar.field": "Count",
              "scalar.comparisons": [{ id: "1", type: "previousPeriod" }],
              ...settings,
            },
          },
          { data: { cols: COLS, rows, insights: INSIGHTS } },
        ),
      ]}
      renderingContext={renderingContext}
    />,
  );

describe("static SmartScalar", () => {
  it("should show the comparison value by default", () => {
    const markup = toMarkup(ROWS);

    expect(markup).toContain(">vs. previous month: </span>");
    expect(markup).toContain(">300</span>");
  });

  it("should hide the comparison value when scalar.show_comparison_value is false", () => {
    const markup = toMarkup(ROWS, { "scalar.show_comparison_value": false });

    expect(markup).toContain(">3.33%</span>");
    expect(markup).toContain(">vs. previous month</span>");
    expect(markup).not.toContain("300");
  });

  it("should keep the (No data) status when the comparison value is hidden", () => {
    const markup = toMarkup(ROWS_WITH_MISSING_VALUE, {
      "scalar.show_comparison_value": false,
    });

    expect(markup).toContain(">N/A</span>");
    expect(markup).toContain(">vs. previous month: </span>");
    expect(markup).toContain(">(No data)</span>");
  });
});
