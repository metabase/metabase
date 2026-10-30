import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupContentDiagnosticsCountsEndpoint,
  setupContentDiagnosticsCountsErrorEndpoint,
  setupInvalidateFindingsEndpoint,
  setupListDuplicatedFindingsEndpoint,
  setupListImbalancedFindingsEndpoint,
  setupListSlowFindingsEndpoint,
  setupListStaleFindingsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Outlet, Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { defer } from "metabase/utils/promise";
import type {
  ContentDiagnosticsCountsResponse,
  ContentDiagnosticsStaleFinding,
  ListImbalancedFindingsResponse,
} from "metabase-types/api";
import {
  createMockContentDiagnosticsImbalancedFinding,
  createMockContentDiagnosticsStaleFinding,
  createMockListDuplicatedFindingsResponse,
  createMockListImbalancedFindingsResponse,
  createMockListSlowFindingsResponse,
  createMockListStaleFindingsResponse,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { getContentDiagnosticsRoutes } from "./routes";

const COUNTS: ContentDiagnosticsCountsResponse = {
  stale: 137,
  duplicated: 11,
  slow: 23,
  empty: 1,
  sparse: 6,
  crowded: 2,
};

interface SetupOpts {
  countsError?: boolean;
  findings?: ContentDiagnosticsStaleFinding[];
  total?: number;
  initialRoute?: string;
  getImbalancedResponse?: (
    url: string,
  ) => ListImbalancedFindingsResponse | Promise<ListImbalancedFindingsResponse>;
  getCounts?: () =>
    | ContentDiagnosticsCountsResponse
    | Promise<ContentDiagnosticsCountsResponse>;
}

function setup({
  getCounts = () => COUNTS,
  countsError = false,
  findings = [],
  total = findings.length,
  initialRoute = Urls.staleContent(),
  getImbalancedResponse = () =>
    createMockListImbalancedFindingsResponse({ data: [], total: 0 }),
}: SetupOpts = {}) {
  if (countsError) {
    setupContentDiagnosticsCountsErrorEndpoint();
  } else {
    setupContentDiagnosticsCountsEndpoint(getCounts, {
      name: "content-counts",
    });
  }
  setupListStaleFindingsEndpoint(
    createMockListStaleFindingsResponse({ data: findings, total }),
  );
  setupListDuplicatedFindingsEndpoint(
    createMockListDuplicatedFindingsResponse({ data: [], total: 0 }),
  );
  setupListSlowFindingsEndpoint(
    createMockListSlowFindingsResponse({ data: [], total: 0 }),
  );
  setupListImbalancedFindingsEndpoint(({ url }) => getImbalancedResponse(url));
  for (const key of [
    "stale",
    "duplicated",
    "slow",
    "empty",
    "sparse",
    "crowded",
  ] as const) {
    setupUserKeyValueEndpoints({
      namespace: "content_diagnostics",
      key,
      value: {},
    });
  }
  mockGetBoundingClientRect({ width: 100, height: 100 });

  return renderWithProviders(
    <Route
      path={Urls.contentDiagnostics()}
      element={
        <MonitorContent>
          <Outlet />
        </MonitorContent>
      }
    >
      {getContentDiagnosticsRoutes()}
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: {
        currentUser: createMockUser(),
        // The pages are gated on the feature at render time, so the tree alone
        // puts their upsell page on screen.
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            content_diagnostics: true,
          }),
        }),
      },
    },
  );
}

const getCountCalls = () =>
  fetchMock.callHistory.calls("path:/api/ee/content-diagnostics/counts");
const getTab = (name: string) => screen.getByRole("tab", { name });

async function switchTab(name: string, emptyState: string) {
  await userEvent.click(getTab(name));
  expect(await screen.findByText(emptyState)).toBeVisible();
  expect(getTab(name)).toHaveAttribute("aria-selected", "true");
}

async function visitAllTabs() {
  await switchTab("Duplicated", "No duplicated content found");
  await switchTab("Slow", "No slow content found");
  await switchTab("Empty", "No empty content found");
  await switchTab("Sparse", "No sparse content found");
  await switchTab("Crowded", "No crowded content found");
  await switchTab("Stale", "No stale content found");
}

describe("content diagnostics section counts", () => {
  it("maps all six default populations and reuses counts and cached findings across tab cycles", async () => {
    setup();
    expect(await screen.findByText("No stale content found")).toBeVisible();
    expect(await within(getTab("Stale")).findByText("137")).toBeVisible();
    expect(within(getTab("Duplicated")).getByText("11")).toBeVisible();
    expect(within(getTab("Slow")).getByText("23")).toBeVisible();
    expect(within(getTab("Empty")).getByText("1")).toBeVisible();
    expect(within(getTab("Sparse")).getByText("6")).toBeVisible();
    expect(within(getTab("Crowded")).getByText("2")).toBeVisible();

    await visitAllTabs();
    await visitAllTabs();

    expect(getCountCalls()).toHaveLength(1);
    for (const path of ["stale", "duplicated", "slow"]) {
      expect(
        fetchMock.callHistory.calls(`path:/api/ee/content-diagnostics/${path}`),
      ).toHaveLength(1);
    }
    expect(
      fetchMock.callHistory.calls(
        "path:/api/ee/content-diagnostics/imbalanced",
      ),
    ).toHaveLength(3);
  });

  it("keeps filtered and paginated findings independent of default counts", async () => {
    setup({
      findings: [
        createMockContentDiagnosticsStaleFinding({
          entity_display_name: "Sales overview",
        }),
      ],
      total: 60,
      initialRoute: `${Urls.staleContent()}?page=1&query=Sales&threshold-days=90&include-personal-collections=false`,
    });
    expect(await screen.findByText("Sales overview")).toBeVisible();
    expect(await within(getTab("Stale")).findByText("137")).toBeVisible();
    const calls = getCountCalls();
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).search).toBe("");
    const listCalls = fetchMock.callHistory.calls(
      "path:/api/ee/content-diagnostics/stale",
    );
    expect(listCalls).toHaveLength(1);
    const params = new URL(listCalls[0].url).searchParams;
    expect(params.get("query")).toBe("Sales");
    expect(params.get("offset")).toBe("25");
    expect(params.get("limit")).toBe("25");
    expect(params.get("threshold-days")).toBe("90");
    expect(params.get("include-personal-collections")).toBe("false");
  });

  it("keeps navigation working and hides badges when counts fail", async () => {
    setup({ countsError: true });
    expect(await screen.findByText("No stale content found")).toBeVisible();
    await waitFor(() =>
      expect(
        fetchMock.callHistory.done("path:/api/ee/content-diagnostics/counts"),
      ).toBe(true),
    );
    await visitAllTabs();
    await waitFor(() =>
      expect(
        within(getTab("Stale")).queryByTestId("tab-count-skeleton"),
      ).not.toBeInTheDocument(),
    );
    expect(getTab("Stale")).toHaveTextContent(/^Stale$/);
  });

  it("retains counts across tab changes during a dismissal-triggered refresh", async () => {
    const pendingCounts = defer<ContentDiagnosticsCountsResponse>();
    setupInvalidateFindingsEndpoint({ invalidated: [1], skipped: [] });
    setup({
      findings: [
        createMockContentDiagnosticsStaleFinding({
          id: 1,
          entity_display_name: "Stale question",
        }),
      ],
    });
    expect(await screen.findByText("Stale question")).toBeVisible();
    expect(await within(getTab("Stale")).findByText("137")).toBeVisible();
    fetchMock.modifyRoute("content-counts", {
      response: () => pendingCounts.promise,
    });
    await userEvent.click(screen.getByLabelText("Select all"));
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss finding" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Dismiss finding",
      }),
    );
    await waitFor(() => expect(getCountCalls()).toHaveLength(2));
    const calls = fetchMock.callHistory.calls(
      "path:/api/ee/content-diagnostics/invalidate",
    );
    expect(calls).toHaveLength(1);
    const body: unknown = await calls[0].request?.json();
    expect(body).toEqual({ ids: [1] });
    await switchTab("Duplicated", "No duplicated content found");
    expect(within(getTab("Stale")).getByText("137")).toBeVisible();
    await act(async () => pendingCounts.resolve({ ...COUNTS, stale: 136 }));
    expect(await within(getTab("Stale")).findByText("136")).toBeVisible();
    expect(getCountCalls()).toHaveLength(2);
  });

  it("shares the pending count request without blocking tab navigation", async () => {
    const pendingCounts = defer<ContentDiagnosticsCountsResponse>();
    setup({ getCounts: () => pendingCounts.promise });
    expect(await screen.findByText("No stale content found")).toBeVisible();
    await visitAllTabs();
    expect(getCountCalls()).toHaveLength(1);
    await act(async () => pendingCounts.resolve(COUNTS));
    expect(await within(getTab("Stale")).findByText("137")).toBeVisible();
    await switchTab("Duplicated", "No duplicated content found");
    expect(getCountCalls()).toHaveLength(1);
  });
});

describe("content diagnostics tab state", () => {
  const EMPTY_FINDINGS = [
    createMockContentDiagnosticsImbalancedFinding({
      id: 1,
      finding_type: "empty",
      entity_type: "dashboard",
      entity_id: 11,
      entity_display_name: "Blank orders dashboard",
      content_count: 0,
    }),
    createMockContentDiagnosticsImbalancedFinding({
      id: 2,
      finding_type: "empty",
      entity_type: "collection",
      entity_id: 12,
      entity_display_name: "Blank orders collection",
      content_count: 0,
    }),
  ];
  const SPARSE_FINDING = createMockContentDiagnosticsImbalancedFinding({
    id: 3,
    finding_type: "sparse",
    entity_type: "dashboard",
    entity_id: 13,
    entity_display_name: "Thin dashboard",
    content_count: 1,
  });
  const SPARSE_RESPONSE_DELAY = 200;

  const getImbalancedResponse = (url: string) => {
    const params = new URL(url, "http://localhost").searchParams;
    const query = params.get("query")?.toLowerCase();
    const entityTypes = params.getAll("entity-types");
    const findingTypes = params.getAll("finding-types");

    if (findingTypes.length === 1 && findingTypes[0] === "empty") {
      const data = EMPTY_FINDINGS.filter(
        (finding) =>
          (query == null ||
            (finding.entity_display_name ?? "")
              .toLowerCase()
              .includes(query)) &&
          (entityTypes.length === 0 ||
            entityTypes.includes(finding.entity_type)),
      );
      return createMockListImbalancedFindingsResponse({
        data,
        total: data.length,
      });
    }

    // The neighbouring tab only gets its finding back for an unfiltered request. The response is
    // delayed so the assertions made right after switching tabs run before it arrives.
    const isCleanSparseRequest =
      findingTypes.length === 1 &&
      findingTypes[0] === "sparse" &&
      query == null &&
      entityTypes.length === 0;
    const data = isCleanSparseRequest ? [SPARSE_FINDING] : [];
    return new Promise<ListImbalancedFindingsResponse>((resolve) =>
      setTimeout(
        () =>
          resolve(
            createMockListImbalancedFindingsResponse({
              data,
              total: data.length,
            }),
          ),
        SPARSE_RESPONSE_DELAY,
      ),
    );
  };

  it("starts a neighbouring tab clean, with no search, filters or sidebar", async () => {
    setup({
      initialRoute: Urls.imbalancedContent("empty"),
      getImbalancedResponse,
    });
    const list = await screen.findByRole("treegrid");
    expect(
      await within(list).findByText("Blank orders dashboard"),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search"), "orders");
    await waitFor(() => {
      expect(
        fetchMock.callHistory
          .calls("path:/api/ee/content-diagnostics/imbalanced")
          .some(
            (call) => new URL(call.url).searchParams.get("query") === "orders",
          ),
      ).toBe(true);
    });

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("checkbox", {
        name: "Dashboards",
      }),
    );
    await waitFor(() => {
      expect(
        within(list).queryByText("Blank orders dashboard"),
      ).not.toBeInTheDocument();
    });
    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await userEvent.click(within(list).getByText("Blank orders collection"));
    const sidebar = await screen.findByTestId("content-diagnostics-sidebar");
    expect(sidebar).toHaveTextContent("Blank orders collection");
    expect(screen.getByLabelText("Search")).toHaveValue("orders");
    expect(
      screen.getByTestId("content-diagnostics-filter-indicator"),
    ).toBeInTheDocument();

    await userEvent.click(getTab("Sparse"));

    // Before the neighbouring tab's findings arrive.
    expect(
      screen.queryByTestId("content-diagnostics-sidebar"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toHaveValue("");

    expect(await screen.findByText("Thin dashboard")).toBeInTheDocument();
    expect(
      screen.queryByTestId("content-diagnostics-sidebar"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toHaveValue("");
    expect(
      screen.getByTestId("content-diagnostics-filter-button"),
    ).toBeEnabled();
    expect(
      screen.queryByTestId("content-diagnostics-filter-indicator"),
    ).not.toBeInTheDocument();

    const sparseParams = new URL(
      String(
        fetchMock.callHistory.lastCall(
          "path:/api/ee/content-diagnostics/imbalanced",
        )?.url,
      ),
    ).searchParams;
    expect(sparseParams.getAll("finding-types")).toEqual(["sparse"]);
    expect(sparseParams.get("query")).toBeNull();
    expect(sparseParams.getAll("entity-types")).toEqual([]);
    expect(getTab("Sparse")).toHaveAttribute("aria-selected", "true");
  });
});
