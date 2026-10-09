import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupContentDiagnosticsCountsEndpoint,
  setupContentDiagnosticsCountsErrorEndpoint,
  setupInvalidateFindingsEndpoint,
  setupListDuplicatedFindingsEndpoint,
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
  createMockListStaleFindingsResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import { getContentDiagnosticsRoutes } from "./routes";

const COUNTS: ContentDiagnosticsCountsResponse = {
  stale: 137,
  duplicated: 0,
  slow: 23,
  empty: 1,
  sparse: 6,
  crowded: 2,
};

interface SetupOpts {
  countsError?: boolean;
  findings?: ContentDiagnosticsStaleFinding[];
  getCounts?: () =>
    | ContentDiagnosticsCountsResponse
    | Promise<ContentDiagnosticsCountsResponse>;
}

function setup({
  getCounts = () => COUNTS,
  countsError = false,
  findings = [],
}: SetupOpts = {}) {
  if (countsError) {
    setupContentDiagnosticsCountsErrorEndpoint();
  } else {
    setupContentDiagnosticsCountsEndpoint(getCounts, {
      name: "content-counts",
    });
  }
  setupListStaleFindingsEndpoint(
    createMockListStaleFindingsResponse({
      data: findings,
      total: findings.length,
    }),
  );
  setupListDuplicatedFindingsEndpoint(
    createMockListDuplicatedFindingsResponse({ data: [], total: 0 }),
  );
  for (const key of ["stale", "duplicated"] as const) {
    setupUserKeyValueEndpoints({
      namespace: "content_diagnostics",
      key,
      value: {},
    });
  }
  mockGetBoundingClientRect({ width: 100, height: 100 });

  return renderWithProviders(
    <>
      <Route
        path={Urls.contentDiagnostics()}
        element={
          <MonitorContent>
            <Outlet />
          </MonitorContent>
        }
      >
        {getContentDiagnosticsRoutes()}
      </Route>
      <Route path="/outside" element={<div>Outside the section</div>} />
    </>,
    {
      withRouter: true,
      initialRoute: Urls.staleContent(),
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
}

describe("content diagnostics section counts", () => {
  it("reuses counts and cached findings when switching tabs repeatedly", async () => {
    setup();
    expect(await screen.findByText("No stale content found")).toBeVisible();
    expect(await within(getTab("Stale")).findByText("137")).toBeVisible();

    for (let visit = 0; visit < 2; visit++) {
      await switchTab("Duplicated", "No duplicated content found");
      await switchTab("Stale", "No stale content found");
    }

    expect(getCountCalls()).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls("path:/api/ee/content-diagnostics/stale"),
    ).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls(
        "path:/api/ee/content-diagnostics/duplicated",
      ),
    ).toHaveLength(1);
  });

  it("refreshes counts when reentering the section before the cache expires", async () => {
    let staleCount = 137;
    const { router } = setup({
      getCounts: () => ({ ...COUNTS, stale: staleCount }),
    });
    expect(await within(getTab("Stale")).findByText("137")).toBeVisible();

    act(() => router?.navigate("/outside"));
    expect(await screen.findByText("Outside the section")).toBeVisible();
    staleCount = 138;
    act(() => router?.navigate(Urls.duplicatedContent()));

    expect(
      await screen.findByText("No duplicated content found"),
    ).toBeVisible();
    expect(await within(getTab("Stale")).findByText("138")).toBeVisible();
    expect(getCountCalls()).toHaveLength(2);
    await switchTab("Stale", "No stale content found");
    expect(getCountCalls()).toHaveLength(2);
  });

  it("keeps navigation usable after a count failure without retrying on each tab", async () => {
    setup({ countsError: true });
    expect(await screen.findByText("No stale content found")).toBeVisible();
    await waitFor(() =>
      expect(screen.queryAllByTestId("tab-count-skeleton")).toHaveLength(0),
    );

    await switchTab("Duplicated", "No duplicated content found");
    await switchTab("Stale", "No stale content found");

    expect(getCountCalls()).toHaveLength(1);
    expect(within(getTab("Stale")).queryByText("137")).not.toBeInTheDocument();
  });

  it("retains counts across tab changes during a mutation-triggered refresh", async () => {
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

    try {
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
      await switchTab("Duplicated", "No duplicated content found");
      expect(within(getTab("Stale")).getByText("137")).toBeVisible();
      expect(screen.queryAllByTestId("tab-count-skeleton")).toHaveLength(0);
      await act(async () => pendingCounts.resolve({ ...COUNTS, stale: 136 }));
      expect(await within(getTab("Stale")).findByText("136")).toBeVisible();
      expect(getCountCalls()).toHaveLength(2);
    } finally {
      pendingCounts.resolve(COUNTS);
    }
  });

  it("shares the pending count request across tab navigation", async () => {
    const pendingCounts = defer<ContentDiagnosticsCountsResponse>();
    setup({ getCounts: () => pendingCounts.promise });
    try {
      expect(await screen.findByText("No stale content found")).toBeVisible();
      await switchTab("Duplicated", "No duplicated content found");
      expect(screen.getAllByTestId("tab-count-skeleton")).toHaveLength(6);
      expect(getCountCalls()).toHaveLength(1);
      await act(async () => pendingCounts.resolve(COUNTS));
      expect(await within(getTab("Stale")).findByText("137")).toBeVisible();
      await switchTab("Stale", "No stale content found");
      expect(getCountCalls()).toHaveLength(1);
    } finally {
      pendingCounts.resolve(COUNTS);
    }
  });
});
