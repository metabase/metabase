import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupListSlowFindingsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import {
  type TestRouter,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { parseSearchQuery } from "metabase/utils/browser";
import type {
  ContentDiagnosticsSlowFinding,
  ContentDiagnosticsSlowUserParams,
  ListSlowFindingsResponse,
} from "metabase-types/api";
import {
  createMockContentDiagnosticsCollection,
  createMockContentDiagnosticsSlowFinding,
  createMockContentDiagnosticsUser,
  createMockListSlowFindingsResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import { SlowContentPage } from "./SlowContentPage";

const FINDINGS: ContentDiagnosticsSlowFinding[] = [
  createMockContentDiagnosticsSlowFinding({
    id: 1,
    entity_type: "card",
    entity_display_name: "Sales overview",
    duration_ms: 5000,
  }),
  createMockContentDiagnosticsSlowFinding({
    id: 2,
    entity_type: "dashboard",
    entity_display_name: "Marketing funnel",
    duration_ms: 65000,
  }),
];

type SetupOpts = {
  findings?: ContentDiagnosticsSlowFinding[];
  total?: number;
  urlParams?: Urls.SlowContentParams;
  lastUsedParams?: ContentDiagnosticsSlowUserParams;
  error?: boolean;
  getResponse?: (url: string) => ListSlowFindingsResponse;
};

function setup({
  findings = [],
  total,
  urlParams = {},
  lastUsedParams = {},
  error = false,
  getResponse,
}: SetupOpts = {}) {
  if (error) {
    fetchMock.get("path:/api/ee/content-diagnostics/slow", {
      status: 500,
      body: { message: "Slow scan failed" },
    });
  } else if (getResponse) {
    fetchMock.get("path:/api/ee/content-diagnostics/slow", ({ url }) =>
      getResponse(url),
    );
  } else {
    setupListSlowFindingsEndpoint(
      createMockListSlowFindingsResponse({
        data: findings,
        total: total ?? findings.length,
      }),
    );
  }

  setupUserKeyValueEndpoints({
    namespace: "content_diagnostics",
    key: "slow",
    value: lastUsedParams,
  });

  mockGetBoundingClientRect({ width: 100, height: 100 });

  const { router } = renderWithProviders(
    <Route
      path={Urls.slowContent()}
      element={
        <MonitorContent>
          <SlowContentPage />
        </MonitorContent>
      }
    />,
    {
      withRouter: true,
      initialRoute: Urls.slowContent(urlParams),
      storeInitialState: {
        currentUser: createMockUser(),
      },
    },
  );

  return { router };
}

function getUrlQuery(router: TestRouter | undefined) {
  return parseSearchQuery(router?.location.search ?? "");
}

function getLastRequestUrl() {
  return new URL(
    String(
      fetchMock.callHistory.lastCall("path:/api/ee/content-diagnostics/slow")
        ?.url,
    ),
    "http://localhost",
  );
}

async function waitForListToLoad() {
  expect(await screen.findByRole("treegrid")).toBeInTheDocument();
}

describe("SlowContentPage", () => {
  it("renders slow findings with humanized durations in the table", async () => {
    setup({ findings: FINDINGS });

    const list = await screen.findByRole("treegrid");
    expect(await within(list).findByText("Sales overview")).toBeInTheDocument();
    expect(within(list).getByText("Marketing funnel")).toBeInTheDocument();
    expect(within(list).getByText("5.0s")).toBeInTheDocument();
    expect(within(list).getByText("1m 5s")).toBeInTheDocument();
  });

  it("shows an empty state when there are no findings", async () => {
    setup({ findings: [] });

    expect(
      await screen.findByText("No slow content found"),
    ).toBeInTheDocument();
  });

  it("renders selected slow finding details in the sidebar", async () => {
    const finding = createMockContentDiagnosticsSlowFinding({
      entity_id: 42,
      entity_display_name: "Revenue by category",
      duration_ms: 12300,
      details: {
        collection: createMockContentDiagnosticsCollection({
          id: 20,
          name: "Executive dashboards",
          effective_ancestors: [{ id: "root", name: "Our analytics" }],
        }),
        description: "Shows revenue grouped by product category.",
        owner: createMockContentDiagnosticsUser({ name: "Ada Owner" }),
        creator: createMockContentDiagnosticsUser({ name: "Grace Creator" }),
        view_count: 7,
      },
    });
    setup({ findings: [finding] });

    const list = await screen.findByRole("treegrid");
    await userEvent.click(await within(list).findByText("Revenue by category"));

    const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
    expect(sidebarRegion).toHaveTextContent("Revenue by category");
    expect(sidebarRegion).toHaveTextContent("Executive dashboards");
    expect(sidebarRegion).toHaveTextContent(
      "Shows revenue grouped by product category.",
    );
    expect(sidebarRegion).toHaveTextContent("Grace Creator");
    expect(sidebarRegion).toHaveTextContent("12.3s");
    expect(sidebarRegion).toHaveTextContent("7");
  });

  it("sends the minimum duration filter to the server and reflects it in the Filter popover", async () => {
    setup({ findings: FINDINGS, urlParams: { minDurationMs: 30000 } });
    await waitForListToLoad();

    expect(getLastRequestUrl().searchParams.get("min-duration-ms")).toBe(
      "30000",
    );

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    expect(
      within(popover).getByDisplayValue("30 seconds or more"),
    ).toBeInTheDocument();
  });

  it("sends the query parameter to the server when searching", async () => {
    setup({
      getResponse: (url) =>
        createMockListSlowFindingsResponse({
          data: url.includes("query=sales") ? [FINDINGS[0]] : FINDINGS,
          total: url.includes("query=sales") ? 1 : FINDINGS.length,
        }),
    });
    await waitForListToLoad();

    const input = screen.getByLabelText("Search");
    await userEvent.type(input, "sales");

    await waitFor(() => {
      expect(screen.queryByText("Marketing funnel")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
    expect(getLastRequestUrl().searchParams.get("query")).toBe("sales");
  });

  it("sends the selected entity types to the server via the Filter popover", async () => {
    const { router } = setup({ findings: FINDINGS });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", { name: "Dashboards" }),
    );

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({
        "entity-types": [
          "question",
          "model",
          "metric",
          "document",
          "transform",
        ],
      });
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual([
      "question",
      "model",
      "metric",
      "document",
      "transform",
    ]);
  });

  it("resets to all entity types when the last selected type is deselected", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { entityTypes: ["model"] },
    });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", { name: "Models" }),
    );

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({});
    });
    const allEntityTypes = [
      "Questions",
      "Models",
      "Metrics",
      "Dashboards",
      "Documents",
      "Transforms",
    ];
    allEntityTypes.forEach((label) => {
      expect(
        within(popover).getByRole("checkbox", { name: label }),
      ).toBeChecked();
    });
  });

  it("shows the error state and suppresses the table when the request fails", async () => {
    setup({ error: true });

    expect(await screen.findByText("Slow scan failed")).toBeInTheDocument();
    expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
  });

  it("restores the last-used filter when the URL has no params", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: {},
      lastUsedParams: { min_duration_ms: 3000 },
    });

    await waitForListToLoad();

    expect(getUrlQuery(router)).toEqual({
      "min-duration-ms": "3000",
    });
    expect(getLastRequestUrl().searchParams.get("min-duration-ms")).toBe(
      "3000",
    );
  });

  it("lets an explicit default-valued URL win over the last-used filter", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { page: 0, includePersonalCollections: true },
      lastUsedParams: { min_duration_ms: 3000 },
    });

    await waitForListToLoad();

    expect(getLastRequestUrl().searchParams.get("min-duration-ms")).toBeNull();
    expect(
      getLastRequestUrl().searchParams.get("include-personal-collections"),
    ).toBe("true");
    expect(getUrlQuery(router)).toEqual({});
  });
  it("marks the filter button once non-default filters are applied", async () => {
    setup({ findings: FINDINGS });
    await waitForListToLoad();

    expect(
      screen.queryByTestId("content-diagnostics-filter-indicator"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", { name: "Models" }),
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("content-diagnostics-filter-indicator"),
      ).toBeInTheDocument();
    });
  });

  it("keeps the active filters when moving to the next page", async () => {
    setup({
      findings: FINDINGS,
      total: 50,
      urlParams: { entityTypes: ["model"] },
    });
    await waitForListToLoad();

    await userEvent.click(screen.getByLabelText("Next page"));

    await waitFor(() => {
      expect(getLastRequestUrl().searchParams.get("offset")).toBe("25");
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual([
      "model",
    ]);
  });
  describe("sorting", () => {
    it.each([
      ["Name", "name"],
      ["Type", "entity-type"],
      ["Created by", "created-by"],
      ["Created at", "created-at"],
      ["Duration", "duration-ms"],
    ])("sorts by %s", async (header, sortColumn) => {
      const { router } = setup({ findings: FINDINGS });
      await waitForListToLoad();

      await userEvent.click(
        screen.getByRole("columnheader", { name: new RegExp(`^${header}`) }),
      );

      await waitFor(() => {
        expect(getUrlQuery(router)).toEqual({
          "sort-column": sortColumn,
          "sort-direction": "asc",
        });
      });
      expect(getLastRequestUrl().searchParams.get("sort-column")).toBe(
        sortColumn,
      );
    });

    it("cycles a column through ascending, descending and unsorted", async () => {
      const { router } = setup({ findings: FINDINGS });
      await waitForListToLoad();

      const header = () =>
        screen.getByRole("columnheader", { name: /^Created at/ });

      await userEvent.click(header());
      await waitFor(() => {
        expect(header()).toHaveAttribute("aria-sort", "ascending");
      });
      expect(getUrlQuery(router)).toEqual({
        "sort-column": "created-at",
        "sort-direction": "asc",
      });

      await userEvent.click(header());
      await waitFor(() => {
        expect(header()).toHaveAttribute("aria-sort", "descending");
      });
      expect(getUrlQuery(router)).toEqual({
        "sort-column": "created-at",
        "sort-direction": "desc",
      });

      await userEvent.click(header());
      await waitFor(() => {
        expect(getUrlQuery(router)).toEqual({});
      });
      expect(header()).not.toHaveAttribute("aria-sort");
    });

    it("does not offer sorting by Location", async () => {
      setup({ findings: FINDINGS });
      await waitForListToLoad();

      expect(
        screen.getByRole("columnheader", { name: /^Location/ }),
      ).not.toHaveAttribute("tabindex");
    });
  });
});
