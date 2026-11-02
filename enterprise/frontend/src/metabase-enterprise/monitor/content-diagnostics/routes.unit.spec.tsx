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
} from "metabase-types/api";
import {
  createMockContentDiagnosticsStaleFinding,
  createMockListDuplicatedFindingsResponse,
  createMockListImbalancedFindingsResponse,
  createMockListSlowFindingsResponse,
  createMockListStaleFindingsResponse,
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
  setupListImbalancedFindingsEndpoint(
    createMockListImbalancedFindingsResponse({ data: [], total: 0 }),
  );
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
      storeInitialState: { currentUser: createMockUser() },
    },
  );
}

const getCountCalls = () =>
  fetchMock.callHistory.calls("path:/api/ee/content-diagnostics/counts");
const getTab = (name: string) => screen.getByRole("link", { name });

async function switchTab(name: string, emptyState: string) {
  await userEvent.click(getTab(name));
  expect(await screen.findByText(emptyState)).toBeVisible();
  expect(getTab(name)).toHaveAttribute("aria-current", "page");
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
