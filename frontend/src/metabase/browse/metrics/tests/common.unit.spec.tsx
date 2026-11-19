import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { mockTextOverflow, screen, waitFor, within } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { createMockCollection } from "metabase-types/api/mocks";

import { createMockMetricResult } from "../test-utils";
import type { MetricResult } from "../types";

import { setup } from "./setup";

const EMPTY_STATE_TEXT =
  "Create Metrics to define the official way to calculate important numbers for your team";

const OUR_ANALYTICS = createMockCollection({
  id: "root",
  name: "Our analytics",
});

const FIRST_COLLECTION = createMockCollection({
  id: 9,
  name: "First collection",
});

function createMetrics(): MetricResult[] {
  return [
    createMockMetricResult({
      id: 1,
      name: "Count of products",
      description: "A metric",
      collection: OUR_ANALYTICS,
    }),
    createMockMetricResult({
      id: 2,
      name: "Count of orders",
      description: "A metric",
      collection: FIRST_COLLECTION,
    }),
  ];
}

function findMetricsTable() {
  return screen.findByRole("table", { name: "Table of metrics" });
}

async function findMetricRow(name: string) {
  const table = await findMetricsTable();
  await within(table).findByText(name);
  const row = within(table)
    .getAllByRole("row")
    .find((row) => within(row).queryByText(name) != null);
  if (!row) {
    throw new Error(`No row for ${name}`);
  }
  return row;
}

async function openMetricMenu(name: string) {
  const row = await findMetricRow(name);
  await userEvent.click(within(row).getByLabelText("Metric options"));
  return screen.findByRole("menu");
}

// Menu item names start with the label of their icon
function menuItemName(label: string) {
  return new RegExp(`icon ${label}$`);
}

function getMetricNames() {
  return screen.getAllByTestId("metric-name").map((cell) => cell.textContent);
}

function getRequestBodies(url: string, method: "POST" | "PUT" | "DELETE") {
  return fetchMock.callHistory
    .calls(url, { method })
    .map((call): unknown =>
      call.options.body ? JSON.parse(String(call.options.body)) : null,
    );
}

describe("BrowseMetrics (OSS)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("displays an empty message when no metrics are found", async () => {
    setup({ metricCount: 0 });
    expect(
      await screen.findByText(
        "Create Metrics to define the official way to calculate important numbers for your team",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("Create metric")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create metric" })).toHaveAttribute(
      "href",
      "/metric/new",
    );
  });

  it("displays a new metric header button when no metrics are found", async () => {
    setup({ metricCount: 0 });

    const header = await screen.findByTestId("browse-metrics-header");
    expect(
      await within(header).findByLabelText("Create a new metric"),
    ).toBeInTheDocument();
    expect(
      within(header).getByRole("link", { name: "Create a new metric" }),
    ).toHaveAttribute("href", "/metric/new");
  });

  it("should not show the Create metric button in an empty state if the user does not have data access", async () => {
    setup({ metricCount: 0, canCreateQueries: false });
    expect(
      await screen.findByText(
        "Create Metrics to define the official way to calculate important numbers for your team",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Create metric")).not.toBeInTheDocument();
  });

  it("should not show the new metric header button if the user does not have data access", async () => {
    setup({ metricCount: 0, canCreateQueries: false });
    const header = await screen.findByTestId("browse-metrics-header");
    expect(
      within(header).queryByLabelText("Create a new metric"),
    ).not.toBeInTheDocument();
  });

  it("displays a link to the metrics docs", async () => {
    setup({ metricCount: 0 });
    await screen.findByText(
      "Create Metrics to define the official way to calculate important numbers for your team",
    );
    expect(screen.getByText("Read the docs")).toBeInTheDocument();
  });

  it("displays the Our Analytics collection if it has a metric", async () => {
    setup({ metricCount: 25 });
    const table = await screen.findByRole("table", {
      name: /Table of metrics/,
    });
    expect(table).toBeInTheDocument();
    expect(
      within(table).getAllByTestId("path-for-collection: Our analytics"),
    ).toHaveLength(2);
    expect(within(table).getByText("Metric 20")).toBeInTheDocument();
    expect(within(table).getByText("Metric 21")).toBeInTheDocument();
    expect(within(table).getByText("Metric 22")).toBeInTheDocument();
  });

  it("displays collection breadcrumbs", async () => {
    setup({ metricCount: 5 });
    const table = await screen.findByRole("table", {
      name: /Table of metrics/,
    });
    expect(within(table).getByText("Metric 1")).toBeInTheDocument();
    expect(
      within(table).getAllByTestId("path-for-collection: Alpha"),
    ).toHaveLength(3);
  });

  it("should render links that point to metric detail page", async () => {
    const { router } = setup({ metricCount: 5 });
    const table = await screen.findByRole("table", {
      name: /Table of metrics/,
    });
    expect(
      within(table).getByRole("link", { name: /Metric 1/ }),
    ).toHaveAttribute("href", "/metric/1");
    expect(
      within(table).getByRole("link", { name: /Metric 2/ }),
    ).toHaveAttribute("href", "/metric/2");

    expect(screen.queryByTestId("metric-detail-page")).not.toBeInTheDocument();
    await userEvent.click(within(table).getByText("Metric 1"));
    expect(screen.getByTestId("metric-detail-page")).toBeInTheDocument();
    const location = router?.location;
    expect(location?.pathname).toBe("/metric/1");
  });

  it("opens a metric in a new tab on meta-click without navigating", async () => {
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
    const { router } = setup({ metrics: createMetrics() });

    const table = await findMetricsTable();
    const user = userEvent.setup();
    await user.keyboard("{Meta>}");
    await user.click(within(table).getByText("Count of orders"));
    await user.keyboard("{/Meta}");

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith("/metric/2", "_blank");
    expect(router?.location.pathname).toBe("/");
    expect(screen.queryByTestId("metric-detail-page")).not.toBeInTheDocument();
  });

  it("navigates to the collection of a metric from its collection cell", async () => {
    const { router } = setup({ metrics: createMetrics() });

    const row = await findMetricRow("Count of products");
    await userEvent.click(within(row).getByText("Our analytics"));

    expect(
      await screen.findByRole("heading", { name: "Collection page root" }),
    ).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/collection/root");
  });

  it("lists every metric and shows a markdown description in a tooltip when it is truncated", async () => {
    mockTextOverflow();
    const longName =
      "A very long metric name that should be truncated by the metrics table because it does not fit within the name column";
    const metricNames = [
      "Count of orders",
      "Orders model metric",
      "Count of orders over time",
      "Count of products",
      "Max of product category",
    ];
    setup({
      metrics: [
        ...metricNames.map((name, index) =>
          createMockMetricResult({
            id: index + 1,
            name,
            description: "A metric",
            collection: OUR_ANALYTICS,
          }),
        ),
        createMockMetricResult({
          id: 6,
          name: longName,
          description:
            "This is a _very_ **long description** that should be truncated by the metrics table because it is really very long.",
          collection: OUR_ANALYTICS,
        }),
      ],
    });

    const table = await findMetricsTable();
    for (const name of [...metricNames, longName]) {
      expect(within(table).getByText(name)).toBeInTheDocument();
    }

    await userEvent.hover(within(table).getByText(/This is a/));
    const tooltip = await screen.findByRole("tooltip");
    expect(
      within(tooltip).getByText(/should be truncated/),
    ).toBeInTheDocument();
    expect(within(tooltip).getByText("long description").tagName).toBe(
      "STRONG",
    );
  });

  it("sorts the metrics by name, description and collection", async () => {
    const ROOT_METRIC = { collection: OUR_ANALYTICS };
    setup({
      metrics: [
        createMockMetricResult({
          id: 3,
          name: "Metric C",
          description: "Description Z",
          ...ROOT_METRIC,
        }),
        createMockMetricResult({
          id: 1,
          name: "Metric A",
          description: "Description Y",
          ...ROOT_METRIC,
        }),
        createMockMetricResult({
          id: 4,
          name: "Metric D",
          description: "Description X",
          ...ROOT_METRIC,
        }),
        createMockMetricResult({
          id: 2,
          name: "Metric B",
          description: "Description W",
          collection: FIRST_COLLECTION,
        }),
      ],
    });

    const table = await findMetricsTable();
    await within(table).findByText("Metric A");
    expect(getMetricNames()).toEqual([
      "Metric A",
      "Metric B",
      "Metric C",
      "Metric D",
    ]);

    await userEvent.click(within(table).getByText("Description"));
    expect(getMetricNames()).toEqual([
      "Metric B",
      "Metric D",
      "Metric A",
      "Metric C",
    ]);

    await userEvent.click(within(table).getByText("Collection"));
    expect(getMetricNames()).toEqual([
      "Metric B",
      "Metric A",
      "Metric C",
      "Metric D",
    ]);
  });

  describe("dot menu", () => {
    it("navigates to the collection of a metric", async () => {
      const { router } = setup({ metrics: createMetrics() });

      const menu = await openMetricMenu("Count of orders");
      await userEvent.click(
        within(menu).getByRole("menuitem", {
          name: menuItemName("Open collection"),
        }),
      );

      expect(
        await screen.findByRole("heading", {
          name: "Collection page 9-first-collection",
        }),
      ).toBeInTheDocument();
      expect(router?.location.pathname).toBe("/collection/9-first-collection");
    });

    it("bookmarks, removes the bookmark of, and trashes a metric when the user has write access", async () => {
      const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      setup({ metrics: createMetrics() });

      let menu = await openMetricMenu("Count of orders");
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: menuItemName("Bookmark") }),
      );
      await waitFor(() =>
        expect(
          getRequestBodies("path:/api/bookmark/card/2", "POST"),
        ).toHaveLength(1),
      );
      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "bookmark_added",
        event_detail: "metric",
        triggered_from: "browse_metrics",
      });

      menu = await openMetricMenu("Count of orders");
      expect(
        await within(menu).findByRole("menuitem", {
          name: menuItemName("Remove from bookmarks"),
        }),
      ).toBeInTheDocument();
      await userEvent.click(
        within(menu).getByRole("menuitem", {
          name: menuItemName("Remove from bookmarks"),
        }),
      );
      await waitFor(() =>
        expect(
          getRequestBodies("path:/api/bookmark/card/2", "DELETE"),
        ).toHaveLength(1),
      );

      menu = await openMetricMenu("Count of orders");
      expect(
        await within(menu).findByRole("menuitem", {
          name: menuItemName("Bookmark"),
        }),
      ).toBeInTheDocument();
      await userEvent.click(
        within(menu).getByRole("menuitem", {
          name: menuItemName("Move to trash"),
        }),
      );
      await waitFor(() => {
        expect(screen.queryByText("Count of orders")).not.toBeInTheDocument();
      });
      expect(getRequestBodies("path:/api/card/2", "PUT")).toEqual([
        { archived: true },
      ]);
      expect(screen.getByText("Count of products")).toBeInTheDocument();
      expect(screen.queryByText(EMPTY_STATE_TEXT)).not.toBeInTheDocument();

      menu = await openMetricMenu("Count of products");
      await userEvent.click(
        within(menu).getByRole("menuitem", {
          name: menuItemName("Move to trash"),
        }),
      );
      expect(await screen.findByText(EMPTY_STATE_TEXT)).toBeInTheDocument();
      expect(getRequestBodies("path:/api/card/1", "PUT")).toEqual([
        { archived: true },
      ]);
    });

    it("bookmarks a metric and navigates to its collection, but does not offer to trash it, when the user has no write access", async () => {
      const [writableMetric, readOnlyMetric] = createMetrics();
      const { router } = setup({
        metrics: [
          writableMetric,
          { ...readOnlyMetric, can_write: false, collection: OUR_ANALYTICS },
        ],
      });

      let menu = await openMetricMenu("Count of products");
      expect(
        within(menu).getByRole("menuitem", {
          name: menuItemName("Move to trash"),
        }),
      ).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
      );

      menu = await openMetricMenu("Count of orders");
      expect(
        within(menu).getByRole("menuitem", { name: menuItemName("Bookmark") }),
      ).toBeInTheDocument();
      expect(
        within(menu).queryByRole("menuitem", {
          name: menuItemName("Move to trash"),
        }),
      ).not.toBeInTheDocument();

      await userEvent.click(
        within(menu).getByRole("menuitem", { name: menuItemName("Bookmark") }),
      );
      await waitFor(() =>
        expect(
          getRequestBodies("path:/api/bookmark/card/2", "POST"),
        ).toHaveLength(1),
      );

      menu = await openMetricMenu("Count of orders");
      expect(
        await within(menu).findByRole("menuitem", {
          name: menuItemName("Remove from bookmarks"),
        }),
      ).toBeInTheDocument();
      await userEvent.click(
        within(menu).getByRole("menuitem", {
          name: menuItemName("Remove from bookmarks"),
        }),
      );
      await waitFor(() =>
        expect(
          getRequestBodies("path:/api/bookmark/card/2", "DELETE"),
        ).toHaveLength(1),
      );

      menu = await openMetricMenu("Count of orders");
      expect(
        await within(menu).findByRole("menuitem", {
          name: menuItemName("Bookmark"),
        }),
      ).toBeInTheDocument();
      await userEvent.click(
        within(menu).getByRole("menuitem", {
          name: menuItemName("Open collection"),
        }),
      );
      expect(router?.location.pathname).toBe("/collection/root");
    });
  });
});
