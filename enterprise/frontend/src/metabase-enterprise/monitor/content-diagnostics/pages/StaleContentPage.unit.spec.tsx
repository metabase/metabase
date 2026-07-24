import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupListStaleFindingsEndpoint,
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
import { Route, withRouteProps } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  ContentDiagnosticsFinding,
  ContentDiagnosticsUserParams,
  ListStaleFindingsResponse,
} from "metabase-types/api";
import {
  createMockContentDiagnosticsCollection,
  createMockContentDiagnosticsFinding,
  createMockContentDiagnosticsUser,
  createMockListStaleFindingsResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import { StaleContentPage } from "./StaleContentPage";

const FINDINGS: ContentDiagnosticsFinding[] = [
  createMockContentDiagnosticsFinding({
    id: 1,
    entity_type: "card",
    entity_display_name: "Sales overview",
  }),
  createMockContentDiagnosticsFinding({
    id: 2,
    entity_type: "dashboard",
    entity_display_name: "Marketing funnel",
  }),
];

type SetupOpts = {
  findings?: ContentDiagnosticsFinding[];
  total?: number;
  urlParams?: Urls.ContentDiagnosticsParams;
  lastUsedParams?: ContentDiagnosticsUserParams;
  error?: boolean;
  getResponse?: (url: string) => ListStaleFindingsResponse;
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
    fetchMock.get("path:/api/ee/content-diagnostics/stale", {
      status: 500,
      body: { message: "Stale scan failed" },
    });
  } else if (getResponse) {
    fetchMock.get("path:/api/ee/content-diagnostics/stale", ({ url }) =>
      getResponse(url),
    );
  } else {
    setupListStaleFindingsEndpoint(
      createMockListStaleFindingsResponse({
        data: findings,
        total: total ?? findings.length,
      }),
    );
  }

  setupUserKeyValueEndpoints({
    namespace: "content_diagnostics",
    key: "stale",
    value: lastUsedParams,
  });

  mockGetBoundingClientRect({ width: 100, height: 100 });

  const PageComponent = withRouteProps(StaleContentPage);

  const { history } = renderWithProviders(
    <Route
      path={Urls.staleContent()}
      element={
        <MonitorContent>
          <PageComponent />
        </MonitorContent>
      }
    />,
    {
      withRouter: true,
      initialRoute: Urls.staleContent(urlParams),
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
      fetchMock.callHistory.lastCall("path:/api/ee/content-diagnostics/stale")
        ?.url,
    ),
    "http://localhost",
  );
}

async function waitForListToLoad() {
  expect(await screen.findByRole("treegrid")).toBeInTheDocument();
}

describe("StaleContentPage", () => {
  it("renders stale findings in the table", async () => {
    setup({ findings: FINDINGS });

    const list = await screen.findByRole("treegrid");
    expect(await within(list).findByText("Sales overview")).toBeInTheDocument();
    expect(within(list).getByText("Marketing funnel")).toBeInTheDocument();
  });

  it("shows an empty state when there are no findings", async () => {
    setup({ findings: [] });

    expect(
      await screen.findByText("No stale content found"),
    ).toBeInTheDocument();
  });

  it("renders selected stale finding details in the Monitor sidebar outlet", async () => {
    const finding = createMockContentDiagnosticsFinding({
      entity_id: 42,
      entity_display_name: "Revenue by category",
      details: {
        collection: createMockContentDiagnosticsCollection({
          id: 20,
          name: "Executive dashboards",
          effective_ancestors: [{ id: "root", name: "Our analytics" }],
        }),
        description: "Shows revenue grouped by product category.",
        owner: createMockContentDiagnosticsUser({ name: "Ada Owner" }),
        creator: createMockContentDiagnosticsUser({ name: "Grace Creator" }),
      },
    });
    setup({ findings: [finding] });

    const list = await screen.findByRole("treegrid");
    await userEvent.click(await within(list).findByText("Revenue by category"));

    const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
    const sidebarHeader = within(sidebarRegion).getByTestId(
      "content-diagnostics-sidebar-header",
    );
    expect(sidebarRegion).toHaveTextContent("Revenue by category");
    expect(
      within(sidebarHeader).queryByRole("link", {
        name: "Revenue by category",
      }),
    ).not.toBeInTheDocument();
    // Breadcrumbs show the parent collection path only — not the entity itself.
    const locationRegion = within(sidebarRegion).getByRole("region", {
      name: "Location",
    });
    expect(
      within(locationRegion).getByRole("link", {
        name: "Executive dashboards",
      }),
    ).toBeInTheDocument();
    expect(
      within(locationRegion).queryByRole("link", {
        name: "Revenue by category",
      }),
    ).not.toBeInTheDocument();
    expect(sidebarRegion).toHaveTextContent("Our analytics");
    expect(sidebarRegion).toHaveTextContent("Executive dashboards");
    expect(sidebarRegion).toHaveTextContent(
      "Shows revenue grouped by product category.",
    );
    expect(sidebarRegion).toHaveTextContent("Ada Owner");
    expect(sidebarRegion).toHaveTextContent("Grace Creator");
    expect(screen.getByTestId("monitor-main")).not.toContainElement(
      sidebarRegion,
    );
  });

  it("sets the page parameter when navigating to the next page", async () => {
    const { history } = setup({ findings: FINDINGS, total: 50 });
    await waitForListToLoad();

    await userEvent.click(screen.getByLabelText("Next page"));

    expect(history?.getCurrentLocation().query).toEqual({ page: "1" });
  });

  it("refetches the stale endpoint with the next offset and renders the next page", async () => {
    const secondPageFinding = createMockContentDiagnosticsFinding({
      id: 3,
      entity_type: "card",
      entity_display_name: "Second page question",
    });
    setup({
      total: 50,
      getResponse: (url) => {
        const isSecondPage = url.includes("offset=25");
        return createMockListStaleFindingsResponse({
          data: isSecondPage ? [secondPageFinding] : FINDINGS,
          total: 50,
        });
      },
    });
    await waitForListToLoad();

    await userEvent.click(screen.getByLabelText("Next page"));

    expect(await screen.findByText("Second page question")).toBeInTheDocument();
    expect(screen.queryByText("Sales overview")).not.toBeInTheDocument();

    const lastUrl = getLastRequestUrl();
    expect(lastUrl.searchParams.get("limit")).toBe("25");
    expect(lastUrl.searchParams.get("offset")).toBe("25");
  });

  it("shows the error state and suppresses the table when the stale request fails", async () => {
    setup({ error: true });

    expect(await screen.findByText("Stale scan failed")).toBeInTheDocument();
    expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next page")).not.toBeInTheDocument();
  });

  it("sends the query parameter to the server when searching", async () => {
    setup({
      getResponse: (url) =>
        createMockListStaleFindingsResponse({
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
        "entity-types": ["card", "document", "transform"],
      });
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual([
      "card",
      "document",
      "transform",
    ]);
  });

  it("filters by personal collections server-side via the Location toggle", async () => {
    const { history } = setup({ findings: FINDINGS });
    await waitForListToLoad();

    // Default request includes personal collections.
    expect(
      getLastRequestUrl().searchParams.get("include-personal-collections"),
    ).toBe("true");

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", {
        name: "Include items in personal collections",
      }),
    );

    await waitFor(() => {
      expect(history?.getCurrentLocation().query).toEqual({
        "include-personal-collections": "false",
      });
    });
    expect(
      getLastRequestUrl().searchParams.get("include-personal-collections"),
    ).toBe("false");
  });

  it("restores the last-used filter when the URL has no params", async () => {
    const { history } = setup({
      findings: FINDINGS,
      urlParams: {},
      lastUsedParams: { entity_types: ["card"] },
    });

    await waitForListToLoad();

    // Restored filter is reflected in the URL and sent to the server.
    // (A single value is serialized as a string by the router.)
    expect(history?.getCurrentLocation().query).toEqual({
      "entity-types": "card",
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual([
      "card",
    ]);
  });

  it("prefers URL params over the last-used filter", async () => {
    const { history } = setup({
      findings: FINDINGS,
      urlParams: { entityTypes: ["dashboard"] },
      lastUsedParams: { entity_types: ["card"] },
    });

    await waitForListToLoad();

    expect(history?.getCurrentLocation().query).toEqual({
      "entity-types": "dashboard",
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual([
      "dashboard",
    ]);
  });
});
