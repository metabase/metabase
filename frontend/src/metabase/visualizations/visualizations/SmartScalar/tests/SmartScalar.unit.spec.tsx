import userEvent from "@testing-library/user-event";

import {
  mockTextOverflow,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
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

interface SetupOpts {
  series: Series;
  width?: number;
  height?: number;
}

// an explicit `height={undefined}` would override the mocked ExplicitSize height
const setup = ({ series, width = 800, height }: SetupOpts) =>
  renderWithProviders(
    <Visualization
      rawSeries={series}
      width={width}
      {...(height != null ? { height } : {})}
    />,
  );

interface CompactTrendSetupOpts {
  comparisonCount: number;
}

function setupCompactTrend({ comparisonCount }: CompactTrendSetupOpts) {
  const comparisonTypes = [
    { id: "1", type: "previousPeriod" as const },
    { id: "2", type: "previousValue" as const },
    { id: "3", type: "staticNumber" as const, value: 80, label: "Goal" },
  ].slice(0, comparisonCount);
  renderWithProviders(
    <Visualization
      rawSeries={series({
        rows: [
          ["2019-10-01T00:00:00", 100],
          ["2019-11-01T00:00:00", 120],
        ],
        insights: createMockInsights([{ unit: "month", col: "Count" }]),
        name: "Revenue",
        comparisonTypes,
        settings: { "card.description": "Monthly revenue" },
      })}
      width={170}
      height={82}
      showTitle
    />,
  );
}

const getTrendSymbol = () => screen.getByTestId("trend-symbol");

describe("SmartScalar", () => {
  describe("current metric display", () => {
    it("should show metric value and date", () => {
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup({ series: series({ rows, insights }) });

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

      setup({ series: series({ rows, insights }) });

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

      setup({ series: series({ rows, insights }), width: 400 });

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

      setup({ series: series({ rows, insights }) });

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

      setup({ series: series({ rows, insights }), width: 400 });

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

      setup({ series: series({ rows, insights }), width: 400 });

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

      setup({ series: series({ rows, insights }), width: 400 });

      expect(getTrendSymbol()).toHaveAttribute("data-direction", "no_change");
      expect(screen.getByText("0.00% vs. previous month")).toBeInTheDocument();
    });

    it("should show when data is missing", () => {
      const rows = [
        ["2019-10-01T00:00:00", null],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup({ series: series({ rows, insights }), width: 400 });

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

      setup({ series: series({ rows, insights }), width });

      expect(screen.getByText("81,005")).toBeInTheDocument();
    });

    it("should render compact if normal formatting is >6 characters and width <250", () => {
      const width = 200;
      const rows = [
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 810750.54],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup({ series: series({ rows, insights }), width });

      expect(screen.getByText("810.8k")).toBeInTheDocument();
    });

    it("should show only the first comparison plus a badge with the number of extra ones on a short dashcard", async () => {
      const rows = [
        ["2019-09-01T00:00:00", 200],
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup({
        series: series({
          rows,
          insights,
          comparisonTypes: [
            { id: "1", type: "previousPeriod" },
            { id: "2", type: "previousValue" },
          ],
        }),
        width: 400,
        height: 200,
      });

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

    describe("dashcards tall enough for every comparison", () => {
      const rows = [
        ["2019-09-01T00:00:00", 200],
        ["2019-10-01T00:00:00", 100],
        ["2019-11-01T00:00:00", 120],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);
      const multiComparisonSeries = series({
        rows,
        insights,
        comparisonTypes: [
          { id: "1", type: "previousPeriod" },
          { id: "2", type: "previousValue" },
          { id: "3", type: "staticNumber", value: 80, label: "Goal" },
        ],
      });

      it("should list the primary comparison as the single row and the rest in query builder notation", () => {
        // 400px wide and 264px tall is the size-400 tier at its spec min-height
        setup({ series: multiComparisonSeries, width: 400, height: 264 });

        const list = within(screen.getByTestId("scalar-comparison-list"));
        const lines = list.getAllByTestId("scalar-previous-value");

        expect(lines).toHaveLength(3);
        expect(lines[0]).toHaveTextContent(/^Nov 2019,\s*\+20% MoM \(100\)$/);
        expect(lines[1]).toHaveTextContent(/^vs\. Oct,\s*\+20% \(100\)$/);
        expect(lines[2]).toHaveTextContent(/^vs\. Goal,\s*\+50% \(80\)$/);
        expect(screen.queryByText("+2")).not.toBeInTheDocument();
      });

      it("should keep the badge when the card is shorter than the tier's min-height", async () => {
        setup({ series: multiComparisonSeries, width: 400, height: 263 });

        expect(screen.getByText("+20% MoM")).toBeInTheDocument();
        expect(screen.getByText("+2")).toBeInTheDocument();
        expect(screen.queryByText(/vs\. Goal/)).not.toBeInTheDocument();

        await userEvent.hover(screen.getByTestId("scalar-previous-value"));
        const tooltip = await screen.findByRole("tooltip");
        expect(within(tooltip).getByText("vs. Goal")).toBeInTheDocument();
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it("should open the comparison panel from a listed line that does not fit", async () => {
        mockTextOverflow();
        setup({ series: multiComparisonSeries, width: 400, height: 264 });

        const [firstLine] = within(
          screen.getByTestId("scalar-comparison-list"),
        ).getAllByTestId("scalar-previous-value");
        await userEvent.hover(firstLine);
        const tooltip = within(await screen.findByRole("tooltip"));

        expect(tooltip.getByText("vs. previous month")).toBeInTheDocument();
        expect(tooltip.getByText("vs. Oct")).toBeInTheDocument();
        expect(tooltip.getByText("vs. Goal")).toBeInTheDocument();
        expect(tooltip.getByText("50%")).toBeInTheDocument();
      });

      it("should apply each tier's own min-height", () => {
        // 320px wide is the size-300 tier, whose min-height is 256px
        setup({ series: multiComparisonSeries, width: 320, height: 256 });

        expect(
          within(screen.getByTestId("scalar-comparison-list")).getAllByTestId(
            "scalar-previous-value",
          ),
        ).toHaveLength(3);
      });

      it("should never list comparisons on the smallest cards", () => {
        setup({ series: multiComparisonSeries, width: 100, height: 400 });

        expect(
          screen.queryByTestId("scalar-comparison-list"),
        ).not.toBeInTheDocument();
        expect(screen.getByText("+20%")).toBeInTheDocument();
      });

      it("should keep the single comparison row for one comparison", () => {
        setup({
          series: series({ rows, insights }),
          width: 400,
          height: 400,
        });

        expect(
          screen.queryByTestId("scalar-comparison-list"),
        ).not.toBeInTheDocument();
        expect(screen.getByText("+20% MoM")).toBeInTheDocument();
      });
    });

    it("should show no symbol and only the percentage on the smallest cards", () => {
      const rows = [
        ["2019-10-01T00:00:00", 45000],
        ["2019-11-01T00:00:00", 30759.47],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup({ series: series({ rows, insights }), width: 100 });

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

    it.each([82, 126, 170, 214])(
      "should keep the title visible alongside the compact comparison at width %s (#84334)",
      async (width) => {
        const rows = [
          ["2019-10-01T00:00:00", 50],
          ["2019-11-01T00:00:00", 100],
        ];
        const insights = createMockInsights([{ unit: "month", col: "Count" }]);

        renderWithProviders(
          <Visualization
            rawSeries={series({ rows, insights, name: "Last invoice" })}
            width={width}
            height={82}
            showTitle
          />,
        );

        expect(screen.getByTestId("scalar-title")).toHaveTextContent(
          "Last invoice",
        );
        expect(screen.getByText("+100%")).toBeVisible();
        expect(screen.queryByTestId("trend-symbol")).not.toBeInTheDocument();
        await userEvent.hover(screen.getByTestId("scalar-previous-value"));
        const tooltip = await screen.findByRole("tooltip");
        expect(
          within(tooltip).getByText("vs. previous month"),
        ).toBeInTheDocument();
        expect(
          within(tooltip).queryByText("Last invoice"),
        ).not.toBeInTheDocument();
        await userEvent.unhover(screen.getByTestId("scalar-previous-value"));
      },
    );

    it("should show the description for a single compact comparison", async () => {
      setupCompactTrend({ comparisonCount: 1 });
      await userEvent.hover(screen.getByLabelText("info icon"));
      await waitFor(() =>
        expect(screen.getByText("Monthly revenue")).toBeVisible(),
      );
    });

    it.each([2, 3])(
      "should show %s compact comparisons and hide the info icon",
      async (count) => {
        setupCompactTrend({ comparisonCount: count });
        expect(screen.getByText("Revenue")).toBeVisible();
        expect(screen.getByText("+20%")).toBeVisible();
        expect(screen.queryByLabelText("info icon")).not.toBeInTheDocument();
        expect(screen.getByText(`+${count - 1}`)).toBeVisible();
        await userEvent.hover(screen.getByTestId("scalar-previous-value"));
        const tooltip = await screen.findByRole("tooltip");
        await waitFor(() =>
          expect(within(tooltip).getByText("vs. previous month")).toBeVisible(),
        );
        expect(within(tooltip).getByText("vs. Oct")).toBeVisible();
      },
    );

    it("should not show a hover panel for a single fully-displayed comparison", async () => {
      const rows = [
        ["2019-10-01T00:00:00", 50],
        ["2019-11-01T00:00:00", 100],
      ];
      const insights = createMockInsights([{ unit: "month", col: "Count" }]);

      setup({ series: series({ rows, insights }), width: 400 });

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
      setup({ series: series({ rows, insights }), width: 100 });

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

      setup({
        series: series({
          rows,
          insights,
          comparisonTypes: [
            { id: "1", type: "previousPeriod" },
            { id: "2", type: "periodsAgo", value: 2 },
          ],
        }),
        width: 400,
        height: 200,
      });

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
      setup({ series: series({ rows, insights }), width: 400 });

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
      setup({
        series: series({ rows, insights, settings: hideComparisonValue }),
        width: 400,
      });

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

      setup({
        series: series({
          rows: rowsWithMissingValue,
          insights,
          settings: hideComparisonValue,
        }),
        width: 400,
      });

      const comparison = within(screen.getByTestId("scalar-previous-value"));
      expect(
        comparison.getByText("N/A vs. previous month"),
      ).toBeInTheDocument();
      expect(comparison.getByText("(No data)")).toBeInTheDocument();
    });

    it("should hide the value of every comparison in the hover panel", async () => {
      setup({
        series: series({
          rows,
          insights,
          comparisonTypes: twoComparisons,
          settings: hideComparisonValue,
        }),
        width: 400,
        height: 200,
      });

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
      setup({
        series: series({
          rows: unchangedRows,
          insights,
          settings: hideComparisonValue,
        }),
        width: 100,
      });

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
      setup({
        series: series({
          rows,
          insights,
        }),
      });
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
      expect(screen.getByText("+20% MoM")).toBeInTheDocument();
      expect(screen.getByText("(100)")).toBeInTheDocument();
    });

    it("should use Count when selected", () => {
      setup({ series: series({ rows, insights, field: "Count" }) });
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
      expect(screen.getByText("+20% MoM")).toBeInTheDocument();
      expect(screen.getByText("(100)")).toBeInTheDocument();
    });

    it("should use Sum when selected", () => {
      setup({ series: series({ rows, insights, field: "Sum" }) });
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

        setup({
          series: series({
            rows,
            insights,
            comparisonType: PREVIOUS_VALUE_COMPARISON,
          }),
          width: 400,
        });

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

        setup({
          series: series({
            rows,
            insights,
            comparisonType: PREVIOUS_VALUE_COMPARISON,
          }),
          width: 400,
        });

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

        setup({
          series: series({
            rows,
            insights,
            comparisonType: getPeriodsAgoComparison(2),
          }),
          width: 400,
        });

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

      setup({
        series: series({
          rows,
          insights,
          // Unjustified type cast. FIXME
          comparisonType: getPeriodsAgoComparison("hi" as unknown as number),
        }),
      });

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

    setup({
      series: series({
        rows,
        insights,
        comparisonType: getPeriodsAgoComparison(1),
      }),
    });

    expect(screen.queryByLabelText("warning icon")).not.toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText(/Nov 2019/)).toBeInTheDocument();
    expect(screen.getByText("0.00% vs. previous month")).toBeInTheDocument();
  });
});
