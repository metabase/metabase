import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { NumberColumn } from "__support__/visualizations";
import { loadVisualizationComponents } from "metabase/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/widgets";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Series } from "metabase-types/api";
import type { Insight } from "metabase-types/api/insight";
import { createMockSingleSeries } from "metabase-types/api/mocks";

import {
  PREVIOUS_VALUE_COMPARISON,
  getPeriodsAgoComparison,
  mockSeries as series,
} from "./test-mocks";

registerVisualizations();

// Chart components are loaded on demand. Register them up front so each test
// renders in one pass and can be run on its own.
beforeAll(() => loadVisualizationComponents(["smartscalar"]));

const createMockInsights = (insights: Partial<Insight>[]) => insights;

const setup = (series: Series, width = 800) =>
  renderWithProviders(<Visualization rawSeries={series} width={width} />);

const getTrendSymbol = () => screen.getByTestId("trend-symbol");

describe("SmartScalar", () => {
  describe("current metric display", () => {
    it("should show metric value and date", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }));

      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
    });
  });

  describe("comparison display", () => {
    it("should show increase", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }));

      expect(getTrendSymbol()).toHaveAttribute("data-direction", "arrow_up");
      expect(screen.getByText("+20% MoM")).toBeInTheDocument();
      expect(screen.getByText("(100)")).toBeInTheDocument();
    });

    it("should show ↑ ∞% change", () => {
      const rows = [
        ["2019-10-01T00:00:00", 0],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }), 400);

      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
      expect(getTrendSymbol()).toHaveAttribute("data-direction", "arrow_up");

      expect(screen.getByText("+∞% MoM")).toBeInTheDocument();
      expect(screen.getByText("(0)")).toBeInTheDocument();
    });

    it("should show decrease", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 80],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }));

      expect(screen.getByText("80")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();

      expect(getTrendSymbol()).toHaveAttribute("data-direction", "arrow_down");

      expect(screen.getByText("-20% MoM")).toBeInTheDocument();
      expect(screen.getByText("(100)")).toBeInTheDocument();
    });

    it("should show ↓ ∞% change", () => {
      const rows = [
        ["2019-10-01T00:00:00", 0],
        ["2019-11-01T00:00:00", -100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }), 400);

      expect(screen.getByText("-100")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
      expect(getTrendSymbol()).toHaveAttribute("data-direction", "arrow_down");

      expect(screen.getByText("-∞% MoM")).toBeInTheDocument();
      expect(screen.getByText("(0)")).toBeInTheDocument();
    });

    it("should show 0% change", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }), 400);

      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
      expect(getTrendSymbol()).toHaveAttribute("data-direction", "no_change");
      expect(
        screen.getByText("No change vs. previous month"),
      ).toBeInTheDocument();
    });

    it("should show when data is missing", () => {
      const rows = [
        ["2019-10-01T00:00:00", null],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }), 400);

      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
      expect(screen.getByText("N/A vs. previous month")).toBeInTheDocument();
      expect(screen.getByText("(No data)")).toBeInTheDocument();
    });

    it("shouldn't throw an error getting settings for single-column data", () => {
      expect(() =>
        getSettingsWidgetsForSeries(
          [
            createMockSingleSeries(
              { display: "smartscalar", visualization_settings: {} },
              {
                data: {
                  cols: [NumberColumn({ name: "Count" })],
                  rows: [[100]],
                },
              },
            ),
          ],
          jest.fn(),
        ),
      ).not.toThrow();
    });

    it("shouldn't render compact if normal formatting is <=6 characters", () => {
      const width = 200;
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 81005],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }), width);

      expect(screen.getByText("81,005")).toBeInTheDocument();
    });

    it("should render compact if normal formatting is >6 characters and width <250", () => {
      const width = 200;
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 810750.54],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }), width);

      expect(screen.getByText("810.8k")).toBeInTheDocument();
    });

    it("should show only the first comparison plus a badge with the number of extra ones", async () => {
      const rows = [
        ["2019-09-01T00:00:00", 200],
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(
        series({
          rows,
          insights,
          comparisonTypes: [
            { id: "1", type: "previousPeriod" },
            { id: "2", type: "previousValue" },
          ],
        }),
        400,
      );

      expect(screen.getByText("+20% MoM")).toBeInTheDocument();
      expect(screen.getByText("+1")).toBeInTheDocument();
      // the second comparison shows up only in the tooltip
      expect(screen.queryByText(/vs\. Oct/)).not.toBeInTheDocument();

      await userEvent.hover(screen.getByTestId("scalar-previous-value"));
      const tooltip = await screen.findByRole("tooltip");

      expect(
        within(tooltip).getByText("vs. previous month"),
      ).toBeInTheDocument();
      expect(within(tooltip).getByText("vs. Oct")).toBeInTheDocument();
    });

    it("should display tooltip with full comparison info on hover", async () => {
      const rows = [
        ["2019-10-01T00:00:00", 50],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }), 400);

      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
      expect(screen.getByText("+100% MoM")).toBeInTheDocument();

      await userEvent.hover(screen.getByTestId("scalar-previous-value"));
      const tooltip = await screen.findByRole("tooltip");

      expect(within(tooltip).getByTestId("trend-symbol")).toHaveAttribute(
        "data-direction",
        "arrow_up",
      );
      expect(within(tooltip).getByText("100%")).toBeInTheDocument();
      expect(
        within(tooltip).getByText("vs. previous month"),
      ).toBeInTheDocument();
      expect(within(tooltip).getByText("50")).toBeInTheDocument();
    });
  });

  describe("field selection", () => {
    const rows = [
      ["2019-10-01T00:00:00", 100, 200],
      ["2019-11-01T00:00:00", 120, 220],
    ];
    const insights = createMockInsights([
      { unit: "month", col: "Count" },
      { unit: "month", col: "Sum" },
    ]);

    it("should use first non-date column (Count) by default", () => {
      setup(
        series({
          rows,
          insights,
        }),
      );
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
      expect(screen.getByText("+20% MoM")).toBeInTheDocument();
      expect(screen.getByText("(100)")).toBeInTheDocument();
    });

    it("should use Count when selected", () => {
      setup(series({ rows, insights, field: "Count" }));
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
      expect(screen.getByText("+20% MoM")).toBeInTheDocument();
      expect(screen.getByText("(100)")).toBeInTheDocument();
    });

    it("should use Sum when selected", () => {
      setup(series({ rows, insights, field: "Sum" }));
      expect(screen.getByText("220")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
      expect(screen.getByText("+10% MoM")).toBeInTheDocument();
      expect(screen.getByText("(200)")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    describe("comparison: previousValue", () => {
      it("should skip over rows with null values", () => {
        const rows = [
          ["2019-09-01T00:00:00", 100],
          ["2019-10-01T00:00:00", null],
          ["2019-11-01T00:00:00", 100],
        ];
        const insights = createMockInsights([{ unit: "month", col: "Count" }]);

        setup(
          series({ rows, insights, comparisonType: PREVIOUS_VALUE_COMPARISON }),
          400,
        );

        expect(screen.getByText("100")).toBeInTheDocument();
        expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
        expect(screen.getByText("No change vs. Sep")).toBeInTheDocument();
      });

      it("should handle no previous value to compare to", () => {
        const rows = [
          ["2019-10-01T00:00:00", null],
          ["2019-11-01T00:00:00", 100],
        ];
        const insights = createMockInsights([{ unit: "month", col: "Count" }]);

        setup(
          series({ rows, insights, comparisonType: PREVIOUS_VALUE_COMPARISON }),
          400,
        );

        expect(screen.getByText("100")).toBeInTheDocument();
        expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
        expect(screen.getByText("N/A")).toBeInTheDocument();
        expect(screen.getByText("(No data)")).toBeInTheDocument();
      });
    });

    describe("comparison: periodsAgo", () => {
      it("should display exact date", () => {
        const rows = [
          ["2019-09-01T00:00:00", 100],
          ["2019-10-01T00:00:00", null],
          ["2019-11-01T00:00:00", 100],
        ];
        const insights = createMockInsights([{ unit: "month", col: "Count" }]);

        setup(
          series({
            rows,
            insights,
            comparisonType: getPeriodsAgoComparison(2),
          }),
          400,
        );

        expect(screen.getByText("100")).toBeInTheDocument();
        expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
        expect(screen.getByText("No change vs. Sep")).toBeInTheDocument();
      });
    });
  });

  describe("should handle errors gracefully", () => {
    it("should show error display if error is thrown", async () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(
        series({
          rows,
          insights,
          // Unjustified type cast. FIXME
          comparisonType: getPeriodsAgoComparison("hi" as unknown as number),
        }),
      );

      expect(screen.getByLabelText("warning icon")).toBeInTheDocument();
      expect(
        screen.getByText(
          "No integer value supplied for periods ago comparison.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("should not error when latest value is null (metabase#42948)", () => {
    const rows = [
      ["2019-10-01T00:00:00", 100],
      ["2019-11-01T00:00:00", 100],
      ["2019-12-01T00:00:00", null],
    ];
    const insights = createMockInsights([{ unit: "month", col: "Count" }]);

    setup(
      series({
        rows,
        insights,
        comparisonType: getPeriodsAgoComparison(1),
      }),
    );

    expect(screen.queryByLabelText("warning icon")).not.toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
    expect(
      screen.getByText("No change vs. previous month"),
    ).toBeInTheDocument();
  });
});
