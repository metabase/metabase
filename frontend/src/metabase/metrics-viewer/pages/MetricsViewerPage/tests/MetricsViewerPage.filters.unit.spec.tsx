import { act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";

import {
  ORDERS_METRIC,
  cleanupPage,
  click,
  findPills,
  getChartColors,
  getChartDisplays,
  getColumnPickerButton,
  getDatasetRequests,
  getLegendColors,
  getMetricControls,
  getPillColors,
  getPills,
  metricsState,
  openPillMenu,
  selectDimensionBreakout,
  settle,
  setup,
} from "./setup";

jest.unmock("@uiw/react-codemirror");
jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: jest.requireActual("./setup").MockVisualization,
}));

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const ORDERS_STATE = metricsState([{ type: "metric", id: ORDERS_METRIC.id }]);

beforeEach(() => {
  trackSimpleEvent.mockClear();
});

function getFilterPills() {
  return screen.queryAllByTestId("metrics-viewer-filter-pill");
}

function getCharts() {
  return screen.getAllByTestId("visualization-root");
}

function getChart() {
  return screen.getByTestId("visualization-root");
}

async function selectPillBreakout(pill: HTMLElement, dimensionName: string) {
  const menu = await openPillMenu(pill);
  await click(within(menu).getByText("Add a series breakout"));
  const option = await screen.findByRole("option", { name: dimensionName });
  await click(within(option).getByText(dimensionName));
}

async function getPopover() {
  return screen.findByRole("dialog");
}

/** The values of every "is" filter the dataset requests sent for a dimension. */
function getRequestedFilterValues(dimensionId: string) {
  return getDatasetRequests().map(({ definition }) =>
    (definition.filters ?? []).flatMap(({ filter }) => {
      if (!Array.isArray(filter) || filter[0] !== "=") {
        return [];
      }
      const [, , ref, ...values] = filter;
      return Array.isArray(ref) && ref[2] === dimensionId ? values : [];
    }),
  );
}

/** The bounds of every date range filter the dataset requests sent. */
function getRequestedDateRanges(dimensionId: string) {
  return getDatasetRequests().flatMap(({ definition }) =>
    (definition.filters ?? []).flatMap(({ filter }) => {
      if (!Array.isArray(filter) || filter[0] !== "between") {
        return [];
      }
      const [, , ref, ...bounds] = filter;
      return Array.isArray(ref) && ref[2] === dimensionId
        ? [bounds.map((bound) => String(bound).slice(0, 10))]
        : [];
    }),
  );
}

async function navigate(
  direction: "back" | "forward",
  page: { router: { back(): void; forward(): void } },
) {
  act(() => {
    if (direction === "back") {
      page.router.back();
    } else {
      page.router.forward();
    }
  });
  await settle();
}

describe("MetricsViewerPage > filters", () => {
  // Inside the describe, so it runs before the global cleanup that fails a
  // test on state updates outside act.
  afterEach(async () => {
    await cleanupPage();
  });

  it("adds, edits, and removes categorical metric and dimension filters with a series breakout, and steps through them with browser history (UXW-4849)", async () => {
    const page = setup({ state: ORDERS_STATE });
    await findPills(1);
    await screen.findByTestId("visualization-root");

    // With a single series, a map shows one visualization
    await selectDimensionBreakout("State");
    await waitFor(() => expect(getChartDisplays()).toEqual(["map"]));

    // A series breakout creates multiple series
    await selectDimensionBreakout("Created At");
    await selectPillBreakout(getPills()[0], "Category");
    const legend = await screen.findByTestId("metrics-viewer-breakout-legend");
    for (const category of ["Doohickey", "Gadget", "Gizmo", "Widget"]) {
      expect(await within(legend).findByText(category)).toBeInTheDocument();
    }
    // A line supports multiple series, so it stays unified
    expect(getCharts()).toHaveLength(1);

    await click(screen.getByRole("button", { name: /Filter/ }));
    let popover = await getPopover();
    await click(await within(popover).findByText("Category"));
    popover = await getPopover();
    await click(await within(popover).findByText("Doohickey"));
    await click(within(popover).getByText("Gadget"));
    await click(within(popover).getByRole("button", { name: "Add filter" }));

    await waitFor(() => expect(getFilterPills()).toHaveLength(1));
    const [filterPill] = getFilterPills();
    expect(filterPill).toHaveTextContent("Doohickey");
    expect(filterPill).toHaveTextContent("Gadget");
    expect(filterPill).toHaveTextContent("Category is:");
    expect(filterPill).not.toHaveTextContent("Product");
    expect(filterPill).not.toHaveTextContent("→");
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "metrics_viewer_filter_added",
      triggered_from: "metric_filter",
    });
    await waitFor(() =>
      expect(
        getRequestedFilterValues("orders-product-category"),
      ).toContainEqual(["Doohickey", "Gadget"]),
    );

    // Edit the filter to change the selection
    await click(getFilterPills()[0]);
    popover = await getPopover();
    await click(await within(popover).findByText("Gizmo"));
    await click(within(popover).getByRole("button", { name: "Update filter" }));
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "metrics_viewer_filter_edited",
      triggered_from: "metric_filter",
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("metrics-viewer-breakout-legend"),
      ).toHaveTextContent("Gizmo"),
    );
    const legendAfterEdit = screen.getByTestId(
      "metrics-viewer-breakout-legend",
    );
    expect(legendAfterEdit).toHaveTextContent("Doohickey");
    expect(legendAfterEdit).toHaveTextContent("Gadget");
    expect(getRequestedFilterValues("orders-product-category")).toContainEqual([
      "Doohickey",
      "Gadget",
      "Gizmo",
    ]);

    await selectDimensionBreakout("Category");
    await waitFor(() => expect(getChart()).toHaveTextContent("Doohickey"));
    expect(getChart()).toHaveTextContent("Gizmo");

    // Filter on a per tab level
    await click(
      within(getMetricControls()).getByRole("button", { name: /All values/ }),
    );
    popover = await getPopover();
    await click(await within(popover).findByText("Doohickey"));
    await click(within(popover).getByRole("button", { name: "Add filter" }));
    expect(
      await within(getMetricControls()).findByRole("button", {
        name: /is Doohickey/,
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(getChart()).not.toHaveTextContent("Gizmo"));
    expect(getChart()).toHaveTextContent("Doohickey");
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "metrics_viewer_filter_added",
      triggered_from: "dimension_filter",
    });

    // Remove the metric filter
    await selectDimensionBreakout("State");
    await waitFor(() => expect(getCharts()).toHaveLength(3));
    expect(getFilterPills()).toHaveLength(1);
    await click(
      within(getFilterPills()[0]).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() => expect(getCharts()).toHaveLength(4));
    expect(getFilterPills()).toHaveLength(0);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "metrics_viewer_filter_removed",
      triggered_from: "metric_filter",
    });

    // Navigating back undoes changes: the metric filter comes back
    await navigate("back", page);
    await waitFor(() => expect(getCharts()).toHaveLength(3));
    expect(getFilterPills()).toHaveLength(1);

    // Back to the category dimension
    await navigate("back", page);
    await waitFor(() =>
      expect(getColumnPickerButton()).toHaveTextContent("Category"),
    );

    // Back to before the dimension filter
    await navigate("back", page);
    await waitFor(() => expect(getChart()).toHaveTextContent("Gizmo"));
    expect(getChart()).toHaveTextContent("Doohickey");
    expect(
      within(getMetricControls()).getByRole("button", { name: /All values/ }),
    ).toBeInTheDocument();

    // Navigating forward re-applies changes: the dimension filter
    await navigate("forward", page);
    expect(
      await within(getMetricControls()).findByRole("button", {
        name: /is Doohickey/,
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(getChart()).not.toHaveTextContent("Gizmo"));
    expect(getChart()).toHaveTextContent("Doohickey");

    // The State dimension
    await navigate("forward", page);
    await waitFor(() =>
      expect(getColumnPickerButton()).toHaveTextContent("State"),
    );
    await waitFor(() => expect(getCharts()).toHaveLength(3));

    // The metric filter removal
    await navigate("forward", page);
    await waitFor(() => expect(getCharts()).toHaveLength(4));
    expect(getFilterPills()).toHaveLength(0);
  });

  it("preserves breakout colors when a dimension filter hides some values", async () => {
    setup({ state: ORDERS_STATE });
    await findPills(1);
    await screen.findByTestId("visualization-root");

    await selectPillBreakout(getPills()[0], "Quantity");
    await waitFor(() =>
      expect(Object.keys(getLegendColors()).length).toBeGreaterThan(0),
    );
    const colorsBefore = getLegendColors();

    await click(
      within(getMetricControls()).getByRole("button", { name: /All time/i }),
    );
    let popover = await getPopover();
    await click(await within(popover).findByText(/Fixed date/));
    popover = await getPopover();
    const startDate = within(popover).getByRole("textbox", {
      name: "Start date",
    });
    await userEvent.clear(startDate);
    await userEvent.type(startDate, "February 1, 2027");
    const endDate = within(popover).getByRole("textbox", { name: "End date" });
    await userEvent.clear(endDate);
    await userEvent.type(endDate, "February 7, 2027");
    await click(within(popover).getByRole("button", { name: "Add filter" }));

    await waitFor(() =>
      expect(getRequestedDateRanges("orders-created-at")).toContainEqual([
        "2027-02-01",
        "2027-02-07",
      ]),
    );
    // A 7-day range leaves 3 of the 6 Quantity values in the fixture
    await waitFor(() =>
      expect(Object.keys(getLegendColors())).toEqual(["1", "2", "3"]),
    );
    expect(Object.keys(colorsBefore)).toHaveLength(6);
    const colorsAfter = getLegendColors();
    Object.entries(colorsAfter).forEach(([label, color]) =>
      expect(colorsBefore[label]).toBe(color),
    );
    const chartColors = getChartColors();
    Object.values(colorsAfter).forEach((color) =>
      expect(chartColors).toContain(color),
    );
    expect(getPillColors(getPills()[0])).toHaveLength(
      Object.keys(colorsAfter).length,
    );
  });
});
