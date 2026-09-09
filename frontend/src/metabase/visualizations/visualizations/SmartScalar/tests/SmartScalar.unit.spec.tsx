import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { NumberColumn } from "__support__/visualizations";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  getSettingsWidgetsForSeries,
  loadVisualizationComponents,
} from "metabase/viz-core";
import type { Series } from "metabase-types/api";
import type { Insight } from "metabase-types/api/insight";
import { createMockSingleSeries } from "metabase-types/api/mocks";

import {
  PREVIOUS_PERIOD_COMPARISON,
  PREVIOUS_VALUE_COMPARISON,
  STATIC_NUMBER_COMPARISON,
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
      expect(screen.getByText("0.00% vs. previous month")).toBeInTheDocument();
    });

    it("should show no change when the difference rounds to 0% (not an up/down arrow)", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 100.000001],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }), 400);

      expect(getTrendSymbol()).toHaveAttribute("data-direction", "no_change");
      expect(screen.getByText("0.00% vs. previous month")).toBeInTheDocument();
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

    it("should show no symbol and only the percentage on the smallest cards", () => {
      const rows = [
        ["2019-10-01T00:00:00", 45000],
        ["2019-11-01T00:00:00", 30759.47],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }), 100);

      expect(screen.getByText("30,759.47")).toBeInTheDocument();
      expect(screen.queryByTestId("trend-symbol")).not.toBeInTheDocument();
      expect(screen.getByText("-31.65%")).toBeInTheDocument();
      expect(screen.queryByText(/MoM/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Nov 2019/)).not.toBeInTheDocument();
    });

    it("should list all comparisons in the query builder", () => {
      const rows = [
        ["2019-09-01T00:00:00", 200],
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      renderWithProviders(
        <Visualization
          rawSeries={series({
            rows,
            insights,
            comparisonTypes: [
              { id: "1", type: "previousPeriod" },
              { id: "2", type: "periodsAgo", value: 2 },
            ],
          })}
          width={800}
          isQueryBuilder
        />,
      );

      const list = screen.getByTestId("scalar-comparison-list");
      expect(within(list).getByText("vs. previous month")).toBeInTheDocument();
      expect(within(list).getByText("vs. Sep")).toBeInTheDocument();
      expect(within(list).getByText("+20% (100)")).toBeInTheDocument();
      expect(within(list).getByText("-40% (200)")).toBeInTheDocument();
      // no "+N" badge in the full list
      expect(screen.queryByText("+1")).not.toBeInTheDocument();
    });

    it("should show a missing comparison in the full list", () => {
      const rows = [
        ["2019-10-01T00:00:00", null],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      renderWithProviders(
        <Visualization
          rawSeries={series({
            rows,
            insights,
            comparisonTypes: [
              { id: "1", type: "previousPeriod" },
              { id: "2", type: "periodsAgo", value: 2 },
            ],
          })}
          width={800}
          isQueryBuilder
        />,
      );

      const list = screen.getByTestId("scalar-comparison-list");
      expect(within(list).getByText("vs. previous month")).toBeInTheDocument();
      expect(within(list).getAllByText("N/A (No data)").length).toBeGreaterThan(
        0,
      );
    });

    it("should show a single comparison inline in the query builder", () => {
      const rows = [
        ["2019-10-01T00:00:00", 45683.68],
        ["2019-11-01T00:00:00", 30759.47],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      renderWithProviders(
        <Visualization
          rawSeries={series({ rows, insights })}
          width={800}
          isQueryBuilder
        />,
      );

      // no list, one inline row with the date, the short description, and
      // the full (non-compact) comparison value; the trend symbol shows
      expect(
        screen.queryByTestId("scalar-comparison-list"),
      ).not.toBeInTheDocument();
      const row = screen.getByTestId("scalar-previous-value");
      expect(within(row).getByTestId("scalar-period")).toHaveTextContent(
        "Nov 2019",
      );
      expect(within(row).getByText("-32.67% MoM")).toBeInTheDocument();
      expect(within(row).getByText("(45,683.68)")).toBeInTheDocument();
      expect(getTrendSymbol()).toHaveAttribute("data-direction", "arrow_down");
    });

    it("should show the full layout on standalone question views", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      renderWithProviders(
        <Visualization
          rawSeries={series({
            rows,
            insights,
            comparisonTypes: [
              { id: "1", type: "previousPeriod" },
              { id: "2", type: "periodsAgo", value: 2 },
            ],
          })}
          width={800}
          isStandaloneQuestion
        />,
      );

      expect(screen.getByTestId("scalar-comparison-list")).toBeInTheDocument();
    });

    it("should show the collection badge next to the inline title", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      renderWithProviders(
        <Visualization
          rawSeries={series({ rows, insights, name: "Revenue" })}
          width={800}
          height={400}
          showTitle
          headerIcon={{ name: "star" }}
        />,
      );

      const title = screen.getByTestId("scalar-title");
      expect(within(title).getByLabelText("star icon")).toBeInTheDocument();
    });

    it("should not show a trend symbol for several comparisons in the query builder", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      renderWithProviders(
        <Visualization
          rawSeries={series({
            rows,
            insights,
            comparisonTypes: [
              { id: "1", type: "previousPeriod" },
              { id: "2", type: "periodsAgo", value: 2 },
            ],
          })}
          width={800}
          isQueryBuilder
        />,
      );

      expect(screen.getByTestId("scalar-comparison-list")).toBeInTheDocument();
      expect(screen.queryByTestId("trend-symbol")).not.toBeInTheDocument();
    });

    it("should show one tooltip at a time on the smallest cards", async () => {
      const rows = [
        ["2019-10-01T00:00:00", 50],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      // narrow width forces the smallest tier, where the title only shows on hover
      renderWithProviders(
        <Visualization
          rawSeries={series({ rows, insights, name: "Last invoice" })}
          width={100}
          showTitle
        />,
      );

      // hovering the comparison shows its tooltip, not the title
      await userEvent.hover(screen.getByTestId("scalar-previous-value"));
      const tooltip = await screen.findByRole("tooltip");
      expect(
        within(tooltip).getByText("vs. previous month"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Last invoice")).not.toBeInTheDocument();
      await userEvent.unhover(screen.getByTestId("scalar-previous-value"));

      // hovering the rest of the card shows the title
      await userEvent.hover(screen.getByTestId("scalar-content"));
      expect(await screen.findByText("Last invoice")).toBeInTheDocument();
    });

    it("should not show a hover panel for a single fully-displayed comparison", async () => {
      const rows = [
        ["2019-10-01T00:00:00", 50],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(series({ rows, insights }), 400);

      expect(screen.getByText("100")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
      expect(screen.getByText("+100% MoM")).toBeInTheDocument();

      // one comparison, fully visible — the panel would add no information
      await userEvent.hover(screen.getByTestId("scalar-previous-value"));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("should show the hover panel with full info on the smallest cards", async () => {
      const rows = [
        ["2019-10-01T00:00:00", 50],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      // narrow width forces the percent-only format, so the panel adds info
      setup(series({ rows, insights }), 100);

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

    it("should open the panel with keyboard navigation", async () => {
      const rows = [
        ["2019-10-01T00:00:00", 50],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup(
        series({
          rows,
          insights,
          comparisonTypes: [
            { id: "1", type: "previousPeriod" },
            { id: "2", type: "periodsAgo", value: 2 },
          ],
        }),
        400,
      );

      await userEvent.tab();

      expect(screen.getByTestId("scalar-previous-value")).toHaveFocus();
      const tooltip = await screen.findByRole("tooltip");
      expect(
        within(tooltip).getByText("vs. previous month"),
      ).toBeInTheDocument();
    });

    it("should not be keyboard-focusable when there is no panel", async () => {
      const rows = [
        ["2019-10-01T00:00:00", 50],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      // one fully-displayed comparison — no panel, so nothing to focus
      setup(series({ rows, insights }), 400);

      expect(screen.getByTestId("scalar-previous-value")).not.toHaveAttribute(
        "tabindex",
      );
    });
  });

  describe("scalar.show_comparison_value", () => {
    const rows = [
      ["2019-10-01T00:00:00", 50],
      ["2019-11-01T00:00:00", 100],
    ];
    const insights = createMockInsights([{ unit: "month", col: "Count" }]);
    const hideComparisonValue = { "scalar.show_comparison_value": false };
    const twoComparisons = [
      PREVIOUS_PERIOD_COMPARISON,
      STATIC_NUMBER_COMPARISON,
    ];

    it("should add an enabled Display toggle right after Compact number", () => {
      const widgets = getSettingsWidgetsForSeries(
        series({ rows, insights }),
        jest.fn(),
      );
      const displayWidgetIds = widgets
        .filter((widget) => widget.section === "Display")
        .map((widget) => widget.id);
      const widget = widgets.find(
        (widget) => widget.id === "scalar.show_comparison_value",
      );

      expect(displayWidgetIds.slice(0, 3)).toEqual([
        "scalar.switch_positive_negative",
        "scalar.compact_primary_number",
        "scalar.show_comparison_value",
      ]);
      expect(widget?.title).toBe("Show comparison value");
      expect(widget?.value).toBe(true);
    });

    it("should hide the comparison value but keep the percent change", () => {
      setup(series({ rows, insights, settings: hideComparisonValue }), 400);

      const comparison = within(screen.getByTestId("scalar-previous-value"));
      expect(getTrendSymbol()).toHaveAttribute("data-direction", "arrow_up");
      expect(comparison.getByText("+100% MoM")).toBeInTheDocument();
      expect(comparison.queryByText("(50)")).not.toBeInTheDocument();
    });

    it("should keep the (No data) status when the previous value is missing", () => {
      const rowsWithMissingValue = [
        ["2019-10-01T00:00:00", null],
        ["2019-11-01T00:00:00", 100],
      ];

      setup(
        series({
          rows: rowsWithMissingValue,
          insights,
          settings: hideComparisonValue,
        }),
        400,
      );

      const comparison = within(screen.getByTestId("scalar-previous-value"));
      expect(
        comparison.getByText("N/A vs. previous month"),
      ).toBeInTheDocument();
      expect(comparison.getByText("(No data)")).toBeInTheDocument();
    });

    it("should hide the value of every comparison in the hover panel", async () => {
      setup(
        series({
          rows,
          insights,
          comparisonTypes: twoComparisons,
          settings: hideComparisonValue,
        }),
        400,
      );

      const comparison = within(screen.getByTestId("scalar-previous-value"));
      expect(comparison.getByText("+100% MoM")).toBeInTheDocument();
      expect(comparison.getByText("+1")).toBeInTheDocument();
      expect(comparison.queryByText("(50)")).not.toBeInTheDocument();

      await userEvent.hover(screen.getByTestId("scalar-previous-value"));
      const tooltip = within(await screen.findByRole("tooltip"));

      expect(tooltip.getByText("vs. previous month")).toBeInTheDocument();
      expect(tooltip.getByText("vs. Goal")).toBeInTheDocument();
      expect(tooltip.getByText("25%")).toBeInTheDocument();
      expect(tooltip.queryByText("50")).not.toBeInTheDocument();
      expect(tooltip.queryByText("80")).not.toBeInTheDocument();
    });

    it("should hide the value of an unchanged comparison in the hover panel", async () => {
      const unchangedRows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 100],
      ];

      // the smallest tier shows the percentage only, so the panel is always available
      setup(
        series({
          rows: unchangedRows,
          insights,
          settings: hideComparisonValue,
        }),
        100,
      );

      await userEvent.hover(screen.getByTestId("scalar-previous-value"));
      const tooltip = within(await screen.findByRole("tooltip"));

      expect(tooltip.getByText("vs. previous month")).toBeInTheDocument();
      expect(tooltip.queryByText("100")).not.toBeInTheDocument();
    });

    it("should hide the comparison values in the query builder list", () => {
      renderWithProviders(
        <Visualization
          rawSeries={series({
            rows,
            insights,
            comparisonTypes: twoComparisons,
            settings: hideComparisonValue,
          })}
          width={800}
          isQueryBuilder
        />,
      );

      const list = within(screen.getByTestId("scalar-comparison-list"));
      expect(list.getByText("vs. previous month")).toBeInTheDocument();
      expect(list.getByText("+100%")).toBeInTheDocument();
      expect(list.getByText("vs. Goal")).toBeInTheDocument();
      expect(list.getByText("+25%")).toBeInTheDocument();
      expect(list.queryByText(/\(50\)|\(80\)/)).not.toBeInTheDocument();
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
        expect(screen.getByText("0.00% vs. Sep")).toBeInTheDocument();
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
        expect(screen.getByText("0.00% vs. Sep")).toBeInTheDocument();
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
    expect(screen.getByText("0.00% vs. previous month")).toBeInTheDocument();
  });
});
