import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import type { Metric } from "metabase-types/api";

import {
  DEFAULT_METRICS,
  ORDERS_METRIC,
  cleanupPage,
  click,
  enterFormula,
  findPills,
  getChartColors,
  getDatasetRequests,
  getLegendColors,
  getPillColors,
  getPills,
  moveCursorToEnd,
  moveCursorToStart,
  openFormulaEditor,
  openPillMenu,
  pickSearchResult,
  pressBackspace,
  pressDelete,
  runFormula,
  settle,
  setup,
  typeText,
} from "./setup";

jest.unmock("@uiw/react-codemirror");
jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: jest.requireActual("./setup").MockVisualization,
}));

function getIndicatorCount(pill: HTMLElement) {
  return within(pill).getByTestId("color-indicator-container").children.length;
}

function expectColorsInChart(colors: string[]) {
  const chartColors = getChartColors();
  colors.forEach((color) => expect(chartColors).toContain(color));
}

async function selectPillBreakout(pill: HTMLElement, dimensionName: string) {
  const menu = await openPillMenu(pill);
  await click(within(menu).getByText("Add a series breakout"));
  const option = await screen.findByRole("option", { name: dimensionName });
  // The option's label, not the option row, handles the click.
  await click(within(option).getByText(dimensionName));
}

function projectedDimensionIds(metricId: number) {
  return getDatasetRequests()
    .filter((request) =>
      JSON.stringify(request.definition.expression).includes(
        `"metric",{"lib/uuid"`,
      ),
    )
    .flatMap((request) => request.definition.projections ?? [])
    .filter((projection) => projection.id === metricId)
    .map((projection) =>
      projection.projection.map((ref) =>
        Array.isArray(ref) ? String(ref[2]) : "",
      ),
    );
}

const TEST_MEASURE_NAME = "Test Measure";

function getChartSeriesNames() {
  return screen
    .getAllByTestId("chart-series-name")
    .map((element) => element.textContent);
}

async function renameExpressionPill(pill: HTMLElement, name: string) {
  const menu = await openPillMenu(pill);
  await click(within(menu).getByRole("menuitem", { name: /Rename/ }));
  const input = await screen.findByTestId("expression-name-input");
  expect(input).toHaveFocus();
  await userEvent.clear(input);
  await userEvent.type(input, name ? `${name}{enter}` : "{enter}");
  await settle();
}

async function setupWithOrders() {
  const page = setup();
  await enterFormula([{ name: "Count of orders" }]);
  await screen.findByTestId("visualization-root");
  return page;
}

async function addOrdersPlusMeasureExpression() {
  await enterFormula([
    { name: "Count of orders" },
    "+",
    { name: TEST_MEASURE_NAME },
  ]);
  return findPills(2);
}

describe("MetricsViewerPage > formula", () => {
  // Inside the describe, so it runs before the global cleanup that fails a
  // test on state updates outside act.
  afterEach(async () => {
    await cleanupPage();
  });

  it("shows a No results state for a metric whose query returns no rows", async () => {
    const emptyMetric: Metric = {
      ...ORDERS_METRIC,
      id: 9,
      name: "Empty Metric",
    };
    setup({
      metrics: [...DEFAULT_METRICS, emptyMetric],
      emptyMetricIds: [emptyMetric.id],
    });

    await enterFormula([{ name: "Empty Metric" }]);

    expect(
      await screen.findByRole("heading", { name: "No results" }),
    ).toBeInTheDocument();
  });

  it("adds multiple metrics one by one from the search picker", async () => {
    const ordersOverTime: Metric = {
      ...ORDERS_METRIC,
      id: 4,
      name: "Count of orders over time",
    };
    setup({ metrics: [...DEFAULT_METRICS, ordersOverTime] });

    await enterFormula([
      { name: "Count of products" },
      { name: "Count of orders" },
      { name: "Count of orders over time" },
      { name: "Count of feedback" },
    ]);

    const pills = await findPills(4);
    expect(pills.map((pill) => pill.textContent)).toEqual([
      expect.stringContaining("Count of products"),
      expect.stringContaining("Count of orders"),
      expect.stringContaining("Count of orders over time"),
      expect.stringContaining("Count of feedback"),
    ]);
    await waitFor(() => {
      const requestedMetricIds = getDatasetRequests().flatMap((request) =>
        (request.definition.projections ?? []).map(({ id }) => id),
      );
      expect(new Set(requestedMetricIds)).toEqual(new Set([1, 2, 3, 4]));
    });
  });

  describe("series breakouts", () => {
    it("handles breakouts independently for multiple instances of the same metric", async () => {
      setup();
      await enterFormula([{ name: "Count of orders" }]);
      await enterFormula([
        { name: "Count of orders" },
        "+",
        { name: "Count of products" },
        { name: "Count of orders" },
      ]);

      let pills = await findPills(3);
      expect(pills[1]).toHaveAttribute(
        "data-testid",
        "metrics-viewer-expression-pill",
      );
      await screen.findAllByTestId("chart-series-color");
      expect(getPillColors(pills[0])[0]).not.toEqual(
        getPillColors(pills[2])[0],
      );
      expectColorsInChart(getPillColors(pills[0]));
      expectColorsInChart(getPillColors(pills[2]));

      await selectPillBreakout(pills[0], "Source");

      const legend = await screen.findByTestId(
        "metrics-viewer-breakout-legend",
      );
      expect(
        await within(legend).findByRole("heading", { name: "Source" }),
      ).toBeInTheDocument();
      for (const source of [
        "Twitter",
        "Facebook",
        "Organic",
        "Google",
        "Affiliate",
      ]) {
        expect(await within(legend).findByText(source)).toBeInTheDocument();
      }
      await waitFor(() =>
        expect(getIndicatorCount(getPills()[0])).toBeGreaterThan(1),
      );
      pills = getPills();
      expect(getIndicatorCount(pills[2])).toBe(1);
      expect(projectedDimensionIds(ORDERS_METRIC.id)).toContainEqual([
        "orders-created-at",
        "orders-user-source",
      ]);
      expectColorsInChart(getPillColors(pills[0]));
      expectColorsInChart(getPillColors(pills[2]));
      const legendColors = Object.values(getLegendColors());
      getPillColors(pills[0]).forEach((color) =>
        expect(legendColors).toContain(color),
      );

      await selectPillBreakout(pills[2], "Source");

      await waitFor(() =>
        expect(getIndicatorCount(getPills()[2])).toBeGreaterThan(1),
      );
      pills = getPills();
      expect(getIndicatorCount(pills[0])).toBeGreaterThan(1);
      expectColorsInChart(getPillColors(pills[0]));
      expectColorsInChart(getPillColors(pills[2]));
      expect(getPillColors(pills[0])[0]).not.toEqual(
        getPillColors(pills[2])[0],
      );

      const menu = await openPillMenu(pills[0]);
      await click(within(menu).getByText("Remove series breakout"));

      await waitFor(() => expect(getIndicatorCount(getPills()[0])).toBe(1));
      pills = getPills();
      expect(
        within(screen.getByTestId("metrics-viewer-breakout-legend")).getByRole(
          "heading",
          { name: "Source" },
        ),
      ).toBeInTheDocument();
      expect(getIndicatorCount(pills[2])).toBeGreaterThan(1);
      await waitFor(() => expectColorsInChart(getPillColors(getPills()[0])));
      expectColorsInChart(getPillColors(getPills()[2]));
    });
  });

  describe("series breakouts when the formula changes", () => {
    it("preserves breakout state when editing the formula and re-running", async () => {
      await setupWithOrders();
      await enterFormula([{ name: "Count of orders" }]);
      let pills = await findPills(2);

      await selectPillBreakout(pills[0], "Source");
      await waitFor(() =>
        expect(getIndicatorCount(getPills()[0])).toBeGreaterThan(1),
      );
      expect(
        await screen.findByTestId("metrics-viewer-breakout-legend"),
      ).toBeInTheDocument();

      await openFormulaEditor();
      expect(screen.getByTestId("mini-picker")).toBeInTheDocument();
      await moveCursorToEnd();
      await typeText(", Count of products");
      await pickSearchResult("Count of products");
      await runFormula();

      pills = await findPills(3);
      expect(getIndicatorCount(pills[0])).toBeGreaterThan(1);
      const legend = await screen.findByTestId(
        "metrics-viewer-breakout-legend",
      );
      expect(
        within(legend).getByRole("heading", { name: "Source" }),
      ).toBeInTheDocument();
      expect(getIndicatorCount(pills[2])).toBe(1);
      expect(pills[2]).toHaveTextContent("Count of products");
      expect(getIndicatorCount(pills[1])).toBe(1);

      await click(within(pills[1]).getByLabelText("Remove Count of orders"));

      pills = await findPills(2);
      expect(getIndicatorCount(pills[0])).toBeGreaterThan(1);
      expect(pills[1]).toHaveTextContent("Count of products");
    });
  });

  describe("expression custom names", () => {
    it("renames an expression pill without breakout options or a color change, and reverts to the formula text when the name is cleared", async () => {
      await setupWithOrders();
      let pills = await addOrdersPlusMeasureExpression();
      expect(pills[1]).toHaveTextContent("Count of orders");
      await screen.findAllByTestId("chart-series-color");
      const colorsBefore = getPillColors(pills[1]);

      const menu = await openPillMenu(pills[1]);
      expect(
        within(menu).getByRole("menuitem", { name: /Rename/ }),
      ).toBeInTheDocument();
      expect(
        within(menu).queryByText(/Add a series breakout/),
      ).not.toBeInTheDocument();
      expect(
        within(menu).queryByText(/Change series breakout/),
      ).not.toBeInTheDocument();
      expect(
        within(menu).queryByText(/Remove series breakout/),
      ).not.toBeInTheDocument();
      await click(within(menu).getByRole("menuitem", { name: /Rename/ }));
      const input = await screen.findByTestId("expression-name-input");
      expect(input).toHaveFocus();
      await userEvent.clear(input);
      await userEvent.type(input, "My Custom Expression{enter}");
      await settle();

      pills = await findPills(2);
      expect(pills[1]).toHaveTextContent("My Custom Expression");
      expect(getPillColors(pills[1])).toEqual(colorsBefore);

      await selectPillBreakout(pills[0], "Source");

      const legend = await screen.findByTestId(
        "metrics-viewer-breakout-legend",
      );
      expect(
        await within(legend).findAllByText("My Custom Expression"),
      ).toHaveLength(2);
      expect(
        within(legend).queryByText(/Test Measure/),
      ).not.toBeInTheDocument();
      expect(getChartSeriesNames()).toContain("My Custom Expression");
      expect(
        within(screen.getByTestId("visualization-root")).queryByText(
          /Test Measure/,
        ),
      ).not.toBeInTheDocument();

      await renameExpressionPill(getPills()[1], "");

      pills = await findPills(2);
      expect(pills[1]).not.toHaveTextContent("My Custom Expression");
      expect(pills[1]).toHaveTextContent("Count of orders");
      const legendAfter = screen.getByTestId("metrics-viewer-breakout-legend");
      expect(
        within(legendAfter).queryByText("My Custom Expression"),
      ).not.toBeInTheDocument();
      expect(
        await within(legendAfter).findAllByText(
          "Count of orders + Test Measure",
        ),
      ).toHaveLength(2);
      expect(getChartSeriesNames()).toContain("Count of orders + Test Measure");
      expect(getChartSeriesNames()).not.toContain("My Custom Expression");
    });

    it("preserves the custom name when the formula is re-run with the expression unchanged", async () => {
      await setupWithOrders();
      const pills = await addOrdersPlusMeasureExpression();
      await renameExpressionPill(pills[1], "My Stable Name");
      expect((await findPills(2))[1]).toHaveTextContent("My Stable Name");

      await enterFormula([{ name: "Count of products" }]);

      expect((await findPills(3))[1]).toHaveTextContent("My Stable Name");
      await waitFor(() =>
        expect(getChartSeriesNames()).toContain("My Stable Name"),
      );
      expect(
        within(screen.getByTestId("visualization-root")).queryByText(
          /Test Measure/,
        ),
      ).not.toBeInTheDocument();
    });

    it("preserves the custom name when the expression is edited in place but keeps at least one original metric", async () => {
      await setupWithOrders();
      const pills = await addOrdersPlusMeasureExpression();
      await renameExpressionPill(pills[1], "Preserved Name");
      expect((await findPills(2))[1]).toHaveTextContent("Preserved Name");

      await openFormulaEditor();
      await moveCursorToEnd();
      // One backspace deletes the atomic "Test Measure" token, three more
      // delete " + ". The "Count of orders" token survives.
      await pressBackspace(4);
      await enterFormula(["*", { name: "Count of products" }]);

      const [, expressionPill] = await findPills(2);
      expect(expressionPill).toHaveTextContent("Preserved Name");
      const expressionRequest = getDatasetRequests().at(-1);
      expect(expressionRequest?.definition.expression).toEqual([
        "*",
        {},
        ["metric", { "lib/uuid": "leaf-0" }, ORDERS_METRIC.id],
        ["metric", { "lib/uuid": "leaf-2" }, 2],
      ]);
    });

    it("keeps each expression's own name when an earlier expression is removed", async () => {
      await setupWithOrders();
      await enterFormula(
        [{ name: "Count of orders" }, "+", { name: TEST_MEASURE_NAME }],
        { clear: true },
      );
      let pills = await findPills(1);
      await renameExpressionPill(pills[0], "First Name");
      expect((await findPills(1))[0]).toHaveTextContent("First Name");

      await enterFormula([
        ",",
        { name: "Count of orders" },
        "+",
        { name: TEST_MEASURE_NAME },
      ]);
      pills = await findPills(2);
      await renameExpressionPill(pills[1], "Second Name");
      pills = await findPills(2);
      expect(pills[0]).toHaveTextContent("First Name");
      expect(pills[1]).toHaveTextContent("Second Name");

      await openFormulaEditor();
      await moveCursorToStart();
      // Removes "Count of orders" (atomic), " ", "+", " ", "Test Measure"
      // (atomic), "," and " ", leaving exactly the second expression.
      await pressDelete(7);
      await runFormula();

      pills = await findPills(1);
      expect(pills[0]).toHaveTextContent("Second Name");
      expect(pills[0]).not.toHaveTextContent("First Name");
    });
  });

  describe("expression editing", () => {
    it("does not show 'No compatible dimensions' after deleting and retyping an expression with metrics in a different order (UXW-3748)", async () => {
      setup();
      await enterFormula([
        { name: "Count of orders" },
        "+",
        { name: "Count of products" },
      ]);
      await screen.findByTestId("visualization-root");

      await enterFormula(
        [{ name: "Count of products" }, "+", { name: "Count of orders" }],
        { clear: true },
      );

      await waitFor(() =>
        expect(getDatasetRequests().at(-1)?.definition.expression).toEqual([
          "+",
          {},
          ["metric", { "lib/uuid": "leaf-0" }, 2],
          ["metric", { "lib/uuid": "leaf-2" }, ORDERS_METRIC.id],
        ]),
      );
      expect(
        await screen.findByTestId("visualization-root"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("No compatible dimensions"),
      ).not.toBeInTheDocument();
    });

    it("handles metrics with numeric names in expressions", async () => {
      const numericMetric: Metric = {
        ...ORDERS_METRIC,
        id: 7,
        name: "123",
      };
      setup({ metrics: [...DEFAULT_METRICS, numericMetric] });
      await enterFormula([{ name: "Count of orders" }]);

      await enterFormula([{ name: "123" }, "+", { name: "123" }], {
        clear: true,
      });
      await screen.findByTestId("visualization-root");

      // A literal number typed without picking a metric
      await enterFormula(["+ 123"]);

      await waitFor(() =>
        expect(getDatasetRequests().at(-1)?.definition.expression).toEqual([
          "+",
          {},
          [
            "+",
            {},
            ["metric", { "lib/uuid": "leaf-0" }, numericMetric.id],
            ["metric", { "lib/uuid": "leaf-2" }, numericMetric.id],
          ],
          123,
        ]),
      );
      await waitFor(() =>
        expect(getChartSeriesNames()).toContain("123 + 123 + 123"),
      );

      await enterFormula([",", { name: "123" }]);

      const pills = await findPills(2);
      expect(pills[1]).toHaveTextContent("123");
      await waitFor(() =>
        expect(screen.getAllByTestId("visualization-root")).toHaveLength(2),
      );
      expect(getChartSeriesNames()).toEqual(["123 + 123 + 123", "123"]);
    });
  });
});
