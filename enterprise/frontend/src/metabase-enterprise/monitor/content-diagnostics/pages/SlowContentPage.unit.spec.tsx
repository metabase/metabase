import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupListSlowFindingsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
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

  const { history } = renderWithProviders(
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

  return { history };
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

  it("sends table sort changes to the server and URL", async () => {
    const { history } = setup({ findings: FINDINGS });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByRole("columnheader", { name: /^Duration/ }),
    );

    await waitFor(() => {
      expect(getLastRequestUrl().searchParams.get("sort-column")).toBe(
        "duration-ms",
      );
    });
    expect(getLastRequestUrl().searchParams.get("sort-direction")).toBe("asc");
    expect(history?.getCurrentLocation().query).toEqual({
      "sort-column": "duration-ms",
      "sort-direction": "asc",
    });
  });

  it("sends the minimum duration filter to the server and reflects it in the Filter popover", async () => {
    setup({ findings: FINDINGS, urlParams: { minDurationMs: 10000 } });
    await waitForListToLoad();

    expect(getLastRequestUrl().searchParams.get("min-duration-ms")).toBe(
      "10000",
    );

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    expect(
      within(popover).getByDisplayValue("10 seconds or more"),
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

    const input = screen.getByTestId("content-diagnostics-search-input");
    await userEvent.type(input, "sales");

    await waitFor(() => {
      expect(screen.queryByText("Marketing funnel")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Sales overview")).toBeInTheDocument();
    expect(getLastRequestUrl().searchParams.get("query")).toBe("sales");
  });

  it("sends the selected entity types to the server via the Filter popover", async () => {
    const { history } = setup({ findings: FINDINGS });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", { name: "Dashboards" }),
    );

    await waitFor(() => {
      expect(history?.getCurrentLocation().query).toEqual({
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
    const { history } = setup({
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
      expect(history?.getCurrentLocation().query).toEqual({});
    });
    expect(
      within(popover).getByRole("checkbox", { name: "Dashboards" }),
    ).toBeChecked();
  });

  it("shows the error state and suppresses the table when the request fails", async () => {
    setup({ error: true });

    expect(await screen.findByText("Slow scan failed")).toBeInTheDocument();
    expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
  });

  it("restores the last-used filter when the URL has no params", async () => {
    const { history } = setup({
      findings: FINDINGS,
      urlParams: {},
      lastUsedParams: { min_duration_ms: 3000 },
    });

    await waitForListToLoad();

    expect(history?.getCurrentLocation().query).toEqual({
      "min-duration-ms": "3000",
    });
    expect(getLastRequestUrl().searchParams.get("min-duration-ms")).toBe(
      "3000",
    );
  });
});
