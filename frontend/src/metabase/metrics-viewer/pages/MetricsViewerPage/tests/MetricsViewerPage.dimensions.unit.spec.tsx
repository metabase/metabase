import { within } from "@testing-library/react";

import { screen, waitFor } from "__support__/ui";
import type { SerializedMetricsViewerPageState } from "metabase/common/metrics-viewer";
import type { Metric } from "metabase-types/api";

import {
  FIELD,
  ORDERS_METRIC,
  PRODUCTS_METRIC,
  USER_GROUP,
  cleanupPage,
  click,
  closeDimensionPickerSidebar,
  enterFormula,
  findPills,
  getChartDisplays,
  getColumnPickerButton,
  getDatasetRequests,
  getExpandedMetricAccordion,
  getMetricControls,
  getProjectedDimensionIds,
  getSidebar,
  getUrlState,
  metricsState,
  numberDimension,
  openDimensionPickerSidebar,
  openTimeDimensionConfiguration,
  pressEnter,
  reloadPage,
  selectDimensionBreakout,
  selectMetricDimension,
  setup,
  showColumnLabels,
  textDimension,
  timeDimension,
} from "./setup";

jest.unmock("@uiw/react-codemirror");
jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: jest.requireActual("./setup").MockVisualization,
}));

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const ORDERS_STATE = metricsState([{ type: "metric", id: ORDERS_METRIC.id }]);

const ORDERS_AND_PRODUCTS_STATE = metricsState([
  { type: "metric", id: ORDERS_METRIC.id },
  { type: "metric", id: PRODUCTS_METRIC.id },
]);

function expressionState(
  name: string,
  sourceIds: [string, string],
  standalone: SerializedMetricsViewerPageState["formulaEntities"] = [],
): SerializedMetricsViewerPageState {
  return metricsState([
    ...standalone,
    {
      type: "expression",
      id: `expression:${name}`,
      name,
      tokens: [
        { type: "metric", sourceId: sourceIds[0] },
        { type: "operator", op: "+" },
        { type: "metric", sourceId: sourceIds[1] },
      ],
    },
  ]);
}

async function waitForChart() {
  return screen.findAllByTestId("visualization-root");
}

function sidebarButton(name: string) {
  return within(getSidebar()).getByRole("button", { name });
}

async function waitForProjection(dimensionIds: string[]) {
  await waitFor(() =>
    expect(getProjectedDimensionIds()).toContainEqual(dimensionIds),
  );
}

describe("MetricsViewerPage > dimension picker sidebar", () => {
  // Inside the describe, so it runs before the global cleanup that fails a
  // test on state updates outside act.
  afterEach(async () => {
    await cleanupPage();
  });

  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  describe("regular metric pills", () => {
    it("renders column labels as static text, shows all curated dimensions for a standalone metric, and replaces the selected one", async () => {
      setup({ state: ORDERS_STATE });
      await waitForChart();

      await waitFor(() =>
        expect(getColumnPickerButton()).toHaveTextContent("Time"),
      );
      expect(getColumnPickerButton()).not.toHaveTextContent("Created At");

      await showColumnLabels();
      const pillBar = await screen.findByTestId(
        "metrics-viewer-dimension-pill-bar",
      );
      await click(within(pillBar).getByText("Created At"));
      expect(within(pillBar).queryByRole("button")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("metrics-viewer-dimension-picker-sidebar"),
      ).not.toBeInTheDocument();

      let sidebar = await openDimensionPickerSidebar();
      expect(
        within(sidebar).getByRole("heading", { name: "Break out" }),
      ).toBeInTheDocument();
      expect(
        within(sidebar).getByLabelText("Search fields"),
      ).toBeInTheDocument();
      expect(within(sidebar).getByText("Dimensions")).toBeInTheDocument();
      expect(
        within(sidebar).queryByRole("button", { name: "See all" }),
      ).not.toBeInTheDocument();
      for (const name of ["Created At", "Category", "Source", "No breakout"]) {
        expect(
          within(sidebar).getByRole("button", { name }),
        ).toBeInTheDocument();
      }
      expect(
        within(sidebar).queryByRole("button", { name: "Totals" }),
      ).not.toBeInTheDocument();

      await closeDimensionPickerSidebar();
      expect(
        screen.queryByTestId("metrics-viewer-dimension-picker-sidebar"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("visualization-root")).toBeInTheDocument();

      sidebar = await openDimensionPickerSidebar();
      expect(
        within(sidebar).getByRole("button", { name: "Source" }),
      ).toBeInTheDocument();
      await click(within(sidebar).getByRole("button", { name: "Category" }));
      await waitForProjection(["orders-product-category"]);

      expect(sidebarButton("Category")).toHaveAttribute("aria-pressed", "true");
      expect(sidebarButton("Source")).toHaveAttribute("aria-pressed", "false");

      await click(sidebarButton("Source"));
      await waitForProjection(["orders-user-source"]);
      await waitFor(() =>
        expect(getColumnPickerButton()).toHaveTextContent("Source"),
      );
      expect(getColumnPickerButton()).not.toHaveTextContent("Category");
      expect(sidebarButton("Category")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(sidebarButton("Source")).toHaveAttribute("aria-pressed", "true");
    });

    it("selects and reopens the No breakout state from the viewer controls", async () => {
      setup({ state: ORDERS_STATE });
      await waitForChart();

      const sidebar = await openDimensionPickerSidebar();
      const noBreakout = within(sidebar).getByRole("button", {
        name: "No breakout",
      });
      expect(noBreakout).toHaveAttribute("aria-pressed", "false");
      await click(noBreakout);

      await waitFor(() =>
        expect(sidebarButton("No breakout")).toHaveAttribute(
          "aria-pressed",
          "true",
        ),
      );
      await waitFor(() => expect(getChartDisplays()).toEqual(["scalar"]));
      expect(
        getDatasetRequests().some(({ definition }) =>
          (definition.projections ?? []).every(
            ({ projection }) => projection.length === 0,
          ),
        ),
      ).toBe(true);

      await closeDimensionPickerSidebar();
      expect(
        screen.queryByTestId("metrics-viewer-dimension-picker-sidebar"),
      ).not.toBeInTheDocument();

      await click(
        within(getMetricControls()).getByRole("button", {
          name: "No breakout",
        }),
      );

      const reopened = await screen.findByTestId(
        "metrics-viewer-dimension-picker-sidebar",
      );
      expect(
        within(reopened).getByRole("heading", { name: "Break out" }),
      ).toBeInTheDocument();
      expect(
        within(reopened).getByRole("button", { name: "No breakout" }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    it("selects dimension categories from the sidebar", async () => {
      setup({
        state: expressionState(
          "Count of orders + Test Measure",
          ["metric:1", "measure:100"],
          [{ type: "metric", id: ORDERS_METRIC.id }],
        ),
      });
      await waitForChart();
      await waitFor(() => expect(getChartDisplays()).toEqual(["line"]));

      const sidebar = await openDimensionPickerSidebar();
      await click(within(sidebar).getByRole("button", { name: "See all" }));
      await click(
        within(getExpandedMetricAccordion("Test Measure")).getByRole("button", {
          name: "State",
        }),
      );
      await closeDimensionPickerSidebar();

      await waitForProjection(["measure-user-state"]);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "metrics_viewer_dimension_selected",
      });
      await waitFor(() => expect(getChartDisplays()).toEqual(["map", "map"]));

      await selectDimensionBreakout("Category");
      await waitFor(() => expect(getChartDisplays()).toEqual(["bar"]));

      await click(
        within(getMetricControls()).getByRole("button", { name: "line" }),
      );
      await waitFor(() => expect(getChartDisplays()).toEqual(["line"]));
    });

    it("only shows shared dimensions by default for multiple metric sources", async () => {
      setup({
        state: metricsState([
          { type: "metric", id: ORDERS_METRIC.id },
          { type: "metric", id: 3 },
        ]),
      });
      await findPills(2);
      await waitForChart();

      const sidebar = await openDimensionPickerSidebar();
      expect(sidebar).toHaveTextContent("Shared dimensions");
      expect(sidebar).toHaveTextContent("Time");
      expect(sidebar).not.toHaveTextContent("Rating");

      await click(within(sidebar).getByRole("button", { name: "See all" }));

      expect(
        within(sidebar).getByRole("heading", { name: "All fields" }),
      ).toBeInTheDocument();
      expect(
        within(getExpandedMetricAccordion("Count of feedback")).getByRole(
          "button",
          { name: "Rating" },
        ),
      ).toBeInTheDocument();
    });

    it("configures per-metric dimensions for a shared category", async () => {
      setup({ state: ORDERS_AND_PRODUCTS_STATE });
      await waitForChart();

      await openDimensionPickerSidebar();
      await openTimeDimensionConfiguration();
      await selectMetricDimension("Count of orders", /Birth Date/);

      await waitForProjection(["orders-user-birth-date"]);
      expect(
        within(getSidebar()).getByLabelText(
          "Select dimension for Count of orders",
        ),
      ).toHaveValue("Birth Date");
      expect(
        within(getSidebar()).getByLabelText(
          "Select dimension for Count of products",
        ),
      ).toHaveValue("Created At");
    });

    it("preserves a selected dimension after page reload", async () => {
      const page = setup({
        state: expressionState("Count of orders + Count of products", [
          "metric:1",
          "metric:2",
        ]),
      });
      await waitForChart();

      await selectDimensionBreakout("Category");
      await waitFor(() =>
        expect(getColumnPickerButton()).toHaveTextContent("Category"),
      );

      await reloadPage(page);

      await waitFor(() =>
        expect(getColumnPickerButton()).toHaveTextContent("Category"),
      );
      await waitForProjection(["orders-product-category"]);
      await waitForProjection(["products-category"]);
    });

    it("serializes only the selected dimension breakout in the URL", async () => {
      const page = setup({ state: ORDERS_STATE });
      await waitForChart();

      await selectDimensionBreakout("State");
      await selectDimensionBreakout("Category");

      await waitFor(() => {
        const state = getUrlState(page);
        expect(state.dimensionBreakouts).toHaveLength(1);
        expect(state.dimensionBreakouts[0]).toMatchObject({
          type: "category",
          label: "Category",
        });
        expect(state.selectedDimensionBreakoutId).toBe(
          state.dimensionBreakouts[0].id,
        );
      });

      await reloadPage(page);

      await waitFor(() =>
        expect(getColumnPickerButton()).toHaveTextContent("Category"),
      );
    });
  });

  describe("expression pills", () => {
    it("preserves non-default expression dimensions after page reload", async () => {
      const page = setup();
      await enterFormula(
        [{ name: "Count of orders" }, "+", { name: "Count of products" }],
        { run: false },
      );
      await pressEnter();
      await findPills(1);
      await waitForChart();

      await showColumnLabels();
      expect(
        await screen.findByTestId("metrics-viewer-dimension-pill-bar"),
      ).toHaveTextContent("Multiple dimensions");

      const sidebar = await openDimensionPickerSidebar();
      await click(within(sidebar).getByRole("button", { name: "See all" }));
      expect(
        within(sidebar).getByRole("heading", { name: "All fields" }),
      ).toBeInTheDocument();
      expect(
        within(sidebar).getByRole("button", { name: "Count of orders" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(
        within(sidebar).getByRole("button", { name: "Count of products" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(
        within(sidebar).getAllByRole("button", { name: "Category" }),
      ).toHaveLength(2);
      await click(within(sidebar).getByRole("button", { name: "Back" }));

      await openTimeDimensionConfiguration();
      await selectMetricDimension("Count of orders", /Birth Date/);

      await waitForProjection(["orders-user-birth-date"]);
      expect(
        within(getSidebar()).getByLabelText(
          "Select dimension for Count of orders",
        ),
      ).toHaveValue("Birth Date");
      await waitFor(() => {
        const state = getUrlState(page);
        expect(state.dimensionBreakouts).toHaveLength(1);
        expect(state.selectedDimensionBreakoutId).toBe(
          state.dimensionBreakouts[0].id,
        );
        expect(state.dimensionBreakouts[0].definitions).toHaveLength(2);
      });

      await reloadPage(page);
      await waitForChart();

      await openDimensionPickerSidebar();
      await openTimeDimensionConfiguration();
      expect(
        within(getSidebar()).getByLabelText(
          "Select dimension for Count of orders",
        ),
      ).toHaveValue("Birth Date");
      expect(
        within(getSidebar()).getByLabelText(
          "Select dimension for Count of products",
        ),
      ).toHaveValue("Created At");
    });
  });

  describe("automatic split view", () => {
    it("stacks series into panels when the stack series button is toggled", async () => {
      setup({ state: ORDERS_AND_PRODUCTS_STATE });
      await findPills(2);

      await waitFor(() => expect(getChartDisplays()).toEqual(["line"]));
      const layoutPicker = screen.getByTestId("chart-layout-picker");
      await click(within(layoutPicker).getByLabelText("Stack layout"));
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "stack_series_enabled",
        triggered_from: "metrics_viewer",
      });

      await waitFor(() =>
        expect(screen.getByTestId("visualization-root")).toHaveAttribute(
          "data-split-panels",
          "true",
        ),
      );

      await click(within(layoutPicker).getByLabelText("Default layout"));
      await waitFor(() =>
        expect(screen.getByTestId("visualization-root")).toHaveAttribute(
          "data-split-panels",
          "false",
        ),
      );

      await selectDimensionBreakout("State", { seeAll: true });
      await waitFor(() => expect(getChartDisplays()).toEqual(["map"]));
      expect(
        screen.queryByTestId("chart-layout-picker"),
      ).not.toBeInTheDocument();
    });
  });
});

// ── Shared dimension matching ──

function metric(
  id: number,
  name: string,
  dimensions: Metric["dimensions"],
): Metric {
  return {
    id,
    name,
    description: null,
    collection_id: null,
    dimension_mappings: [],
    dimensions,
  };
}

const PLAIN_PRODUCTS = metric(
  20,
  "Plain products",
  (PRODUCTS_METRIC.dimensions ?? []).map((dimension) => ({
    ...dimension,
    id: `plain-${dimension.id}`,
  })),
);

const PEOPLE_WITH_RENAMED_SOURCE = metric(21, "People with renamed source", [
  timeDimension(
    "renamed-people-created-at",
    "CREATED_AT",
    "Created At",
    FIELD.PEOPLE_CREATED_AT,
  ),
  textDimension(
    "renamed-people-source",
    "SOURCE",
    "Category",
    "type/Source",
    FIELD.PEOPLE_SOURCE,
  ),
  textDimension(
    "renamed-people-state",
    "STATE",
    "State",
    "type/State",
    FIELD.PEOPLE_STATE,
  ),
]);

const ACCOUNTS_BY_COUNTRY = metric(22, "Accounts by country", [
  timeDimension(
    "accounts-created-at",
    "CREATED_AT",
    "Created At",
    FIELD.ACCOUNTS_CREATED_AT,
  ),
  textDimension(
    "accounts-country",
    "COUNTRY",
    "Country",
    "type/Country",
    FIELD.ACCOUNTS_COUNTRY,
  ),
]);

const PEOPLE_BY_STATE = metric(23, "People by state", [
  timeDimension(
    "people-created-at",
    "CREATED_AT",
    "Created At",
    FIELD.PEOPLE_CREATED_AT,
  ),
  textDimension(
    "people-source",
    "SOURCE",
    "Source",
    "type/Source",
    FIELD.PEOPLE_SOURCE,
  ),
  textDimension(
    "people-state",
    "STATE",
    "State",
    "type/State",
    FIELD.PEOPLE_STATE,
  ),
]);

const ORDERS_WITH_USER_STATE = metric(24, "Orders with user state", [
  timeDimension(
    "user-state-orders-created-at",
    "CREATED_AT",
    "Created At",
    FIELD.ORDERS_CREATED_AT,
  ),
  numberDimension(
    "user-state-orders-total",
    "TOTAL",
    "Total",
    "type/Currency",
    FIELD.ORDERS_TOTAL,
  ),
  textDimension(
    "user-state-orders-state",
    "STATE",
    "State",
    "type/State",
    FIELD.PEOPLE_STATE,
    { group: USER_GROUP },
  ),
]);

const ORDERS_WITH_USER_SOURCE = metric(25, "Orders with user source", [
  timeDimension(
    "user-source-orders-created-at",
    "CREATED_AT",
    "Created At",
    FIELD.ORDERS_CREATED_AT,
  ),
  numberDimension(
    "user-source-orders-total",
    "TOTAL",
    "Total",
    "type/Currency",
    FIELD.ORDERS_TOTAL,
  ),
  textDimension(
    "user-source-orders-category",
    "SOURCE",
    "Category",
    "type/Source",
    FIELD.PEOPLE_SOURCE,
    { group: USER_GROUP },
  ),
]);

const PLAIN_ORDERS = metric(26, "Plain orders", [
  timeDimension(
    "plain-orders-created-at",
    "CREATED_AT",
    "Created At",
    FIELD.ORDERS_CREATED_AT,
  ),
  numberDimension(
    "plain-orders-total",
    "TOTAL",
    "Total",
    "type/Currency",
    FIELD.ORDERS_TOTAL,
  ),
  numberDimension(
    "plain-orders-quantity",
    "QUANTITY",
    "Quantity",
    "type/Quantity",
    FIELD.ORDERS_QUANTITY,
  ),
]);

const SHARED_DIMENSION_METRICS = [
  PLAIN_PRODUCTS,
  PEOPLE_WITH_RENAMED_SOURCE,
  ACCOUNTS_BY_COUNTRY,
  PEOPLE_BY_STATE,
  ORDERS_WITH_USER_STATE,
  ORDERS_WITH_USER_SOURCE,
  PLAIN_ORDERS,
];

function setupWithMetrics(metrics: Metric[]) {
  const page = setup({
    metrics: SHARED_DIMENSION_METRICS,
    state: metricsState(metrics.map(({ id }) => ({ type: "metric", id }))),
  });
  return page;
}

async function waitForMetrics(count: number) {
  await findPills(count);
  await waitForChart();
}

function getSerializedBreakout(page: ReturnType<typeof setup>) {
  const [breakout] = getUrlState(page).dimensionBreakouts;
  if (!breakout) {
    throw new Error("Expected a serialized dimension breakout");
  }
  return breakout;
}

function getSlotDimensionId(
  breakout: ReturnType<typeof getSerializedBreakout>,
  slotIndex: number,
) {
  return breakout.definitions.find((entry) => entry.slotIndex === slotIndex)
    ?.dimensionId;
}

describe("MetricsViewerPage > shared dimension matching", () => {
  // Inside the describe, so it runs before the global cleanup that fails a
  // test on state updates outside act.
  afterEach(async () => {
    await cleanupPage();
  });

  it("shows every dimension shared by repeated metric slots", async () => {
    setupWithMetrics([PLAIN_PRODUCTS, PLAIN_PRODUCTS]);
    await waitForMetrics(2);

    const sidebar = await openDimensionPickerSidebar();
    expect(within(sidebar).getByText("Dimensions")).toBeInTheDocument();
    for (const name of [
      "Time",
      "Category",
      "Title",
      "Vendor",
      "Price",
      "Rating",
    ]) {
      expect(within(sidebar).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      within(sidebar).queryByRole("button", { name: "Created At" }),
    ).not.toBeInTheDocument();

    await click(within(sidebar).getByRole("button", { name: "Vendor" }));
    await closeDimensionPickerSidebar();
    await waitForProjection(["plain-products-vendor"]);
    await waitFor(() =>
      expect(getColumnPickerButton()).toHaveTextContent("Vendor"),
    );
  });

  it("does not share same-named dimensions from different source columns", async () => {
    setupWithMetrics([PEOPLE_WITH_RENAMED_SOURCE, PLAIN_PRODUCTS]);
    await waitForMetrics(2);

    const sidebar = await openDimensionPickerSidebar();
    await click(within(sidebar).getByRole("button", { name: "See all" }));
    expect(
      within(
        getExpandedMetricAccordion("People with renamed source"),
      ).getByRole("button", { name: "Category" }),
    ).toBeInTheDocument();
    expect(
      within(getExpandedMetricAccordion("Plain products")).getByRole("button", {
        name: "Category",
      }),
    ).toBeInTheDocument();
    await click(within(sidebar).getByRole("button", { name: "Back" }));

    expect(sidebarButton("Time")).toBeInTheDocument();
    // People's renamed Source and Products' Category share a name but not a
    // source column.
    expect(
      within(getSidebar()).queryByRole("button", { name: "Category" }),
    ).not.toBeInTheDocument();
  });

  it("does not mix country and state geo dimensions", async () => {
    setupWithMetrics([ACCOUNTS_BY_COUNTRY, PEOPLE_BY_STATE]);
    await waitForMetrics(2);

    const sidebar = await openDimensionPickerSidebar();
    await click(within(sidebar).getByRole("button", { name: "See all" }));
    expect(
      within(getExpandedMetricAccordion("Accounts by country")).getByRole(
        "button",
        { name: "Country" },
      ),
    ).toBeInTheDocument();
    expect(
      within(getExpandedMetricAccordion("People by state")).getByRole(
        "button",
        {
          name: "State",
        },
      ),
    ).toBeInTheDocument();
    await click(within(sidebar).getByRole("button", { name: "Back" }));

    expect(sidebarButton("Time")).toBeInTheDocument();
    expect(
      within(getSidebar()).queryByRole("button", { name: "Country" }),
    ).not.toBeInTheDocument();
    expect(
      within(getSidebar()).queryByRole("button", { name: "State" }),
    ).not.toBeInTheDocument();
  });

  it("offers a State option when every metric has a state dimension", async () => {
    const page = setupWithMetrics([PEOPLE_BY_STATE, ORDERS_WITH_USER_STATE]);
    await waitForMetrics(2);

    await selectDimensionBreakout("State");

    await waitFor(() => expect(getChartDisplays()).toEqual(["map", "map"]));
    await waitFor(() => {
      const breakout = getSerializedBreakout(page);
      expect(breakout.type).toBe("geo");
      expect(getSlotDimensionId(breakout, 0)).toBe("people-state");
      expect(getSlotDimensionId(breakout, 1)).toBe("user-state-orders-state");
    });
  });

  it("re-maps other metrics by dimension name when switching breakout type from All fields", async () => {
    const page = setupWithMetrics([ORDERS_WITH_USER_SOURCE, PLAIN_PRODUCTS]);
    await waitForMetrics(2);

    const sidebar = await openDimensionPickerSidebar();
    await click(within(sidebar).getByRole("button", { name: "See all" }));
    await click(
      within(getExpandedMetricAccordion("Orders with user source")).getByRole(
        "button",
        { name: "Category" },
      ),
    );

    // Products maps to its own Category by name, even though Title comes
    // first in its curated list.
    await waitFor(() => {
      const breakout = getSerializedBreakout(page);
      expect(breakout.type).toBe("category");
      expect(getSlotDimensionId(breakout, 0)).toBe(
        "user-source-orders-category",
      );
      expect(getSlotDimensionId(breakout, 1)).toBe("plain-products-category");
    });
    await waitForProjection(["user-source-orders-category"]);
    await waitForProjection(["plain-products-category"]);

    // A same-type pick under one metric changes only that metric.
    await click(
      within(getExpandedMetricAccordion("Plain products")).getByRole("button", {
        name: "Vendor",
      }),
    );

    await waitFor(() => {
      const breakout = getSerializedBreakout(page);
      expect(getSlotDimensionId(breakout, 0)).toBe(
        "user-source-orders-category",
      );
      expect(getSlotDimensionId(breakout, 1)).toBe("plain-products-vendor");
    });
    await waitForProjection(["plain-products-vendor"]);
    expect(getColumnPickerButton()).toHaveTextContent("Category");
  });

  it("leaves metrics without a dimension of the picked type unmapped", async () => {
    const page = setupWithMetrics([PLAIN_ORDERS, PLAIN_PRODUCTS]);
    await waitForMetrics(2);

    const sidebar = await openDimensionPickerSidebar();
    await click(within(sidebar).getByRole("button", { name: "See all" }));
    await click(
      within(getExpandedMetricAccordion("Plain products")).getByRole("button", {
        name: "Category",
      }),
    );

    // Orders has no category dimensions, so it is left unmapped.
    await waitFor(() => {
      const breakout = getSerializedBreakout(page);
      expect(breakout.type).toBe("category");
      expect(getSlotDimensionId(breakout, 0)).toBeUndefined();
      expect(getSlotDimensionId(breakout, 1)).toBe("plain-products-category");
    });
    await findPills(2);
    expect(await screen.findByTestId("visualization-root")).toBeInTheDocument();
  });
});
