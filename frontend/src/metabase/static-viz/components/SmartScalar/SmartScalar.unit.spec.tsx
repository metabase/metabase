import { render, screen } from "__support__/ui";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { colors } from "metabase/ui/colors";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/viz-core";
import type { RowValues, VisualizationSettings } from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { StaticVisualization } from "../StaticVisualization";

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

const setup = (rows: RowValues[], settings: VisualizationSettings = {}) => {
  const series = createMockSingleSeries(
    {
      display: "smartscalar",
      visualization_settings: {
        "scalar.field": "Count",
        "scalar.comparisons": [{ id: "1", type: "previousPeriod" }],
        ...settings,
      },
    },
    {
      data: {
        cols: COLS,
        rows,
        insights: [
          {
            unit: "month",
            col: "Count",
            offset: 0,
            slope: 0,
            "last-change": 0,
            "previous-value": 0,
            "last-value": 0,
          },
        ],
      },
    },
  );

  render(
    <StaticVisualization
      rawSeries={[series]}
      renderingContext={{
        fontFamily: "Lato",
        getColor: createColorGetter(colors),
        measureText: (text, style) =>
          measureTextWidth(text, Number(style.size), Number(style.weight)),
        measureTextHeight: (_, style) => measureTextHeight(Number(style.size)),
        theme: DEFAULT_VISUALIZATION_THEME,
      }}
    />,
  );
};

describe("static-viz SmartScalar", () => {
  it("should render a 0.00% change without an arrow when the value is unchanged", () => {
    setup([
      ["2019-10-01", 300],
      ["2019-11-01", 300],
    ]);

    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.queryByText("↑")).not.toBeInTheDocument();
    expect(screen.queryByText("↓")).not.toBeInTheDocument();
  });

  it("should treat a change that rounds to 0% as no change", () => {
    setup([
      ["2019-10-01", 1000000],
      ["2019-11-01", 1000000.01],
    ]);

    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.queryByText("↑")).not.toBeInTheDocument();
  });

  it("should render a changed comparison with an arrow", () => {
    setup([
      ["2019-10-01", 300],
      ["2019-11-01", 310],
    ]);

    expect(screen.getByText("3.33%")).toBeInTheDocument();
    expect(screen.getByText("↑")).toBeInTheDocument();
  });

  describe("scalar.show_comparison_value", () => {
    const hideComparisonValue = { "scalar.show_comparison_value": false };

    it("should show the comparison value by default", () => {
      setup([
        ["2019-10-01", 300],
        ["2019-11-01", 310],
      ]);

      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("300")).toBeInTheDocument();
    });

    it("should hide the comparison value when the setting is off", () => {
      setup(
        [
          ["2019-10-01", 300],
          ["2019-11-01", 310],
        ],
        hideComparisonValue,
      );

      expect(screen.getByText("3.33%")).toBeInTheDocument();
      expect(screen.getByText("vs. previous month")).toBeInTheDocument();
      expect(screen.queryByText("300")).not.toBeInTheDocument();
    });

    it("should keep the (No data) status when the comparison value is hidden", () => {
      setup(
        [
          ["2019-10-01", null],
          ["2019-11-01", 310],
        ],
        hideComparisonValue,
      );

      expect(screen.getByText("N/A")).toBeInTheDocument();
      expect(screen.getByText("vs. previous month:")).toBeInTheDocument();
      expect(screen.getByText("(No data)")).toBeInTheDocument();
    });
  });
});
