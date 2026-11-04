import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupContentDiagnosticsCountsEndpoint,
  setupInvalidateFindingsEndpoint,
  setupListStaleFindingsEndpoint,
  setupUpdateCardEndpointWithError,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import {
  type TestRouter,
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { UrlStateQuery } from "metabase/common/hooks/use-url-state";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route, queryToSearch } from "metabase/router";
import * as Urls from "metabase/urls";
import { parseSearchQuery } from "metabase/utils/browser";
import { defer } from "metabase/utils/promise";
import type {
  ContentDiagnosticsStaleFinding,
  ContentDiagnosticsStaleUserParams,
  InvalidateFindingsResponse,
  ListStaleFindingsResponse,
} from "metabase-types/api";
import {
  createMockCard,
  createMockContentDiagnosticsCollection,
  createMockContentDiagnosticsStaleFinding,
  createMockContentDiagnosticsUser,
  createMockListStaleFindingsResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import { StaleContentPage } from "./StaleContentPage";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const DASHBOARDS_DROPPED: NonNullable<
  ContentDiagnosticsStaleUserParams["entity_types"]
> = ["question", "model", "metric", "document", "transform"];

const REMEMBERED_FILTER_PATH =
  "path:/api/user-key-value/namespace/content_diagnostics/key/stale";

const FINDINGS: ContentDiagnosticsStaleFinding[] = [
  createMockContentDiagnosticsStaleFinding({
    id: 1,
    entity_type: "card",
    entity_display_name: "Sales overview",
  }),
  createMockContentDiagnosticsStaleFinding({
    id: 2,
    entity_type: "dashboard",
    entity_display_name: "Marketing funnel",
  }),
];

type SetupOpts = {
  findings?: ContentDiagnosticsStaleFinding[];
  total?: number;
  urlParams?: UrlStateQuery;
  lastUsedParams?: ContentDiagnosticsStaleUserParams;
  error?: boolean;
  getResponse?: (
    url: string,
  ) => ListStaleFindingsResponse | Promise<ListStaleFindingsResponse>;
  withUndos?: boolean;
};

function setup({
  findings = [],
  total,
  urlParams = {},
  lastUsedParams = {},
  error = false,
  getResponse,
  withUndos = false,
}: SetupOpts = {}) {
  if (error) {
    fetchMock.get("path:/api/ee/content-diagnostics/stale", {
      status: 500,
      body: { message: "Stale scan failed" },
    });
  } else if (getResponse) {
    setupListStaleFindingsEndpoint(({ url }) => getResponse(url));
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

  setupContentDiagnosticsCountsEndpoint();
  mockGetBoundingClientRect({ width: 100, height: 100 });

  const { router, store } = renderWithProviders(
    <Route
      path={Urls.staleContent()}
      element={
        <MonitorContent>
          <StaleContentPage />
        </MonitorContent>
      }
    />,
    {
      withRouter: true,
      withUndos,
      initialRoute: `${Urls.staleContent()}${queryToSearch(urlParams)}`,
      storeInitialState: {
        currentUser: createMockUser(),
      },
    },
  );

  return { router, store };
}

describe("StaleContentPage", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  describe("analytics", () => {
    it("reports the tab as viewed", async () => {
      setup({ findings: FINDINGS });
      await waitForListToLoad();

      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "content_diagnostics_tab_viewed",
        event_detail: "stale",
      });
    });

    it("reports the finding a user opens, and the entity behind it", async () => {
      setup({ findings: FINDINGS });
      await waitForListToLoad();

      await userEvent.click(screen.getByText("Sales overview"));

      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "content_diagnostics_finding_selected",
        triggered_from: "stale",
        target_id: FINDINGS[0].entity_id,
        event_detail: "card",
      });
    });
  });

  it("renders stale findings in the table", async () => {
    setup({ findings: FINDINGS });

    const list = await screen.findByRole("treegrid");
    expect(await within(list).findByText("Sales overview")).toBeInTheDocument();
    expect(within(list).getByText("Marketing funnel")).toBeInTheDocument();
  });

  it("shows a skeleton only initially and keeps rows under the loader while paging", async () => {
    const pending = defer<ListStaleFindingsResponse>();
    const firstPage = createMockListStaleFindingsResponse({
      data: [
        createMockContentDiagnosticsStaleFinding({
          id: 1,
          entity_display_name: "First page finding",
        }),
      ],
      total: 26,
    });
    const nextPage = createMockListStaleFindingsResponse({
      data: [
        createMockContentDiagnosticsStaleFinding({
          id: 26,
          entity_display_name: "Next page finding",
        }),
      ],
      total: 26,
    });
    setup({
      getResponse: (url) =>
        new URL(url).searchParams.get("offset") === "25"
          ? pending.promise
          : firstPage,
    });
    expect(screen.getByTestId("tree-table-skeleton")).toBeVisible();
    await screen.findByText("First page finding");
    await userEvent.click(screen.getByLabelText("Next page"));
    await waitFor(() =>
      expect(screen.getByTestId("loading-overlay")).toBeVisible(),
    );
    expect(screen.getByText("First page finding")).toBeVisible();
    expect(screen.queryByTestId("tree-table-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("pagination-total")).toHaveTextContent("26");
    await act(async () => pending.resolve(nextPage));
    expect(await screen.findByText("Next page finding")).toBeVisible();
    expect(screen.queryByText("First page finding")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no findings", async () => {
    setup({ findings: [] });

    expect(
      await screen.findByText("No stale content found"),
    ).toBeInTheDocument();
  });

  it("allows findings for read-only entities to be dismissed but not trashed", async () => {
    setup({
      findings: [
        createMockContentDiagnosticsStaleFinding({
          id: 1,
          entity_display_name: "Can trash",
          can_write: true,
        }),
        createMockContentDiagnosticsStaleFinding({
          id: 2,
          entity_display_name: "Read only",
          can_write: false,
        }),
      ],
    });

    const list = await screen.findByRole("treegrid");
    await within(list).findByText("Can trash");

    const rows = within(list).getAllByRole("row");
    const writableRow = rows.find((row) =>
      within(row).queryByText("Can trash"),
    );
    const readonlyRow = rows.find((row) =>
      within(row).queryByText("Read only"),
    );
    if (writableRow == null || readonlyRow == null) {
      throw new Error("expected both finding rows to render");
    }

    expect(within(writableRow).getByRole("checkbox")).toBeEnabled();
    expect(within(readonlyRow).getByRole("checkbox")).toBeEnabled();
    await userEvent.click(within(readonlyRow).getByRole("checkbox"));
    expect(
      screen.getByRole("button", { name: "Move to trash" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Dismiss finding" }),
    ).toBeEnabled();
  });

  it("dismisses findings, refetches the list, and clears selection", async () => {
    let findings = [
      createMockContentDiagnosticsStaleFinding({
        id: 11,
        entity_id: 101,
        entity_display_name: "Dismiss me",
        can_write: false,
      }),
    ];
    setupInvalidateFindingsEndpoint(() => {
      findings = [];
      return { invalidated: [11], skipped: [] };
    });
    setup({
      getResponse: () =>
        createMockListStaleFindingsResponse({
          data: findings,
          total: findings.length,
        }),
    });
    await screen.findByRole("treegrid");
    await userEvent.click(screen.getByLabelText("Select all"));
    await confirmBulkAction("Dismiss finding");
    expect(
      await screen.findByText("No stale content found"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("content-diagnostics-bulk-actions"),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/ee/content-diagnostics/stale")
        .length,
    ).toBeGreaterThan(1);
    const calls = fetchMock.callHistory.calls(
      "path:/api/ee/content-diagnostics/invalidate",
    );
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(JSON.parse(String(call.options.body))).toEqual({ ids: [11] });
  });

  it("keeps rows and pagination until dismissal refetches the authoritative list", async () => {
    const findings = [
      ...FINDINGS,
      ...Array.from({ length: 23 }, (_, index) =>
        createMockContentDiagnosticsStaleFinding({
          id: index + 3,
          entity_id: index + 3,
          entity_display_name: `Finding ${index + 3}`,
        }),
      ),
    ];
    const remainingFinding = createMockContentDiagnosticsStaleFinding({
      id: 26,
      entity_id: 26,
      entity_display_name: "Remaining finding",
    });
    const dismissal = defer<InvalidateFindingsResponse>();
    const refresh = defer<ListStaleFindingsResponse>();
    const dismissalResponse = {
      invalidated: findings.map(({ id }) => id),
      skipped: [],
    };
    const refreshResponse = createMockListStaleFindingsResponse({
      data: [remainingFinding],
      total: 1,
    });
    let listRequests = 0;
    setupInvalidateFindingsEndpoint(() => dismissal.promise);
    setup({
      withUndos: true,
      getResponse: () => {
        listRequests += 1;
        return listRequests === 1
          ? createMockListStaleFindingsResponse({ data: findings, total: 26 })
          : refresh.promise;
      },
    });

    try {
      await screen.findByText("Sales overview");
      await userEvent.click(screen.getByLabelText("Select all"));
      await confirmBulkAction("Dismiss findings");

      expect(screen.getByText("Sales overview")).toBeVisible();
      expect(screen.getByText("Marketing funnel")).toBeVisible();
      expect(screen.getByText(/^1 - 25/)).toHaveTextContent("1 - 25 of 26");
      expect(
        screen.queryByText("No stale content found"),
      ).not.toBeInTheDocument();
      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).getByRole("button", { name: "Dismiss findings" }),
      ).toBeDisabled();
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }),
      ).toBeDisabled();
      expect(
        screen.queryByText("Dismissed 25 findings"),
      ).not.toBeInTheDocument();

      dismissal.resolve(dismissalResponse);
      await waitFor(() =>
        expect(screen.getByText("Dismissed 25 findings")).toBeVisible(),
      );
      await waitFor(() => expect(listRequests).toBe(2));
      expect(screen.getByTestId("loading-overlay")).toBeVisible();
      expect(screen.getByText("Sales overview")).toBeVisible();
      expect(screen.getByText(/^1 - 25/)).toHaveTextContent("1 - 25 of 26");
      expect(
        screen.queryByText("No stale content found"),
      ).not.toBeInTheDocument();

      refresh.resolve(refreshResponse);
      expect(await screen.findByText("Remaining finding")).toBeVisible();
      expect(screen.queryByText("Sales overview")).not.toBeInTheDocument();
      expect(screen.queryByTestId("loading-overlay")).not.toBeInTheDocument();
    } finally {
      dismissal.resolve(dismissalResponse);
      refresh.resolve(refreshResponse);
    }
  });

  it("keeps rows and selection when dismissal fails", async () => {
    const dismissal = defer<Response>();
    const failureResponse = new Response(
      JSON.stringify({ message: "Dismiss failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
    setupInvalidateFindingsEndpoint(() => dismissal.promise);
    setup({ findings: FINDINGS, withUndos: true });

    try {
      await screen.findByText("Sales overview");
      await userEvent.click(screen.getByLabelText("Select all"));
      await confirmBulkAction("Dismiss findings");
      for (const name of ["Sales overview", "Marketing funnel"]) {
        const row = getFindingRow(name);
        expect(row).toBeVisible();
        expect(
          within(row).getByRole("checkbox", { hidden: true }),
        ).toBeChecked();
      }
      expect(screen.queryByText("Dismiss failed")).not.toBeInTheDocument();

      dismissal.resolve(failureResponse);
      await waitFor(() =>
        expect(screen.getByText("Dismiss failed")).toBeVisible(),
      );
      for (const name of ["Sales overview", "Marketing funnel"]) {
        const row = getFindingRow(name);
        expect(row).toBeVisible();
        expect(within(row).getByRole("checkbox")).toBeChecked();
      }
      expect(screen.getByText("2 items selected")).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Dismiss findings" }),
      ).toBeEnabled();
      expect(
        screen.queryByText("Dismissed 2 findings"),
      ).not.toBeInTheDocument();
    } finally {
      dismissal.resolve(failureResponse);
    }
  });

  it("returns to the first page when dismissal removes the last page", async () => {
    const finding = createMockContentDiagnosticsStaleFinding({
      id: 26,
      entity_display_name: "Last page finding",
    });
    let dismissed = false;
    setupInvalidateFindingsEndpoint(() => {
      dismissed = true;
      return { invalidated: [26], skipped: [] };
    });
    const { router } = setup({
      urlParams: { page: "1" },
      getResponse: (url) => {
        const lastPageData = dismissed ? [] : [finding];
        return createMockListStaleFindingsResponse({
          data: url.includes("offset=25") ? lastPageData : FINDINGS,
          total: dismissed ? 25 : 26,
        });
      },
    });
    await screen.findByText("Last page finding");
    await userEvent.click(screen.getByLabelText("Select all"));
    await confirmBulkAction("Dismiss finding");
    expect(await screen.findByText("Sales overview")).toBeInTheDocument();
    await waitFor(() =>
      expect(getLastRequestUrl().searchParams.get("offset")).toBe("0"),
    );
    expect(getUrlQuery(router)).toEqual({});
    expect(
      screen.queryByTestId("content-diagnostics-bulk-actions"),
    ).not.toBeInTheDocument();
  });

  it("archives the selected findings and refetches the list", async () => {
    setupCardEndpoints(createMockCard({ id: 1 }));
    setupCardEndpoints(createMockCard({ id: 2 }));
    const { store } = setup({
      findings: [
        createMockContentDiagnosticsStaleFinding({
          id: 1,
          entity_type: "card",
          entity_id: 1,
          entity_display_name: "First card",
          can_write: true,
        }),
        createMockContentDiagnosticsStaleFinding({
          id: 2,
          entity_type: "card",
          entity_id: 2,
          entity_display_name: "Second card",
          can_write: true,
        }),
      ],
    });

    await screen.findByRole("treegrid");
    await userEvent.click(screen.getByLabelText("Select all"));
    const bulkActions = screen.getByTestId("content-diagnostics-bulk-actions");
    expect(
      within(screen.getByTestId("monitor-main")).getByTestId(
        "content-diagnostics-bulk-actions",
      ),
    ).toBe(bulkActions);
    expect(bulkActions).toHaveStyle({
      position: "absolute",
      left: "50%",
      bottom: "var(--mantine-spacing-lg)",
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Move to trash" }),
    );

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Move to trash" }),
    );

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/card/1")).toHaveLength(1);
    });
    expect(fetchMock.callHistory.calls("path:/api/card/2")).toHaveLength(1);
    // the two archive requests set archived
    for (const id of [1, 2]) {
      const [call] = fetchMock.callHistory.calls(`path:/api/card/${id}`);
      expect(JSON.parse(String(call.options?.body))).toMatchObject({
        archived: true,
      });
    }
    // archiving invalidates the findings cache, so the list refetches
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/content-diagnostics/stale")
          .length,
      ).toBeGreaterThan(1);
    });

    await waitFor(() => {
      expect(
        store
          .getState()
          .undo.some((undo) => undo.message === "Moved 2 items to the trash"),
      ).toBe(true);
    });
  });

  it("keeps items that failed to trash selected", async () => {
    setupCardEndpoints(createMockCard({ id: 1 }));
    setupUpdateCardEndpointWithError(2);
    const { store } = setup({
      findings: [
        createMockContentDiagnosticsStaleFinding({
          id: 1,
          entity_type: "card",
          entity_id: 1,
          entity_display_name: "Ok card",
          can_write: true,
        }),
        createMockContentDiagnosticsStaleFinding({
          id: 2,
          entity_type: "card",
          entity_id: 2,
          entity_display_name: "Bad card",
          can_write: true,
        }),
      ],
    });

    await screen.findByRole("treegrid");
    await userEvent.click(screen.getByLabelText("Select all"));
    await userEvent.click(
      screen.getByRole("button", { name: "Move to trash" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Move to trash" }),
    );

    // the failed item stays selected, so the bar reappears with just it
    expect(await screen.findByText("1 item selected")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        store
          .getState()
          .undo.some((undo) => undo.message === "Couldn't remove 1 item"),
      ).toBe(true);
    });
  });

  it("renders selected stale finding details in the Monitor sidebar outlet", async () => {
    const finding = createMockContentDiagnosticsStaleFinding({
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
      within(sidebarHeader).getByRole("link", {
        name: "Revenue by category",
      }),
    ).toHaveAttribute("href", "/question/42-revenue-by-category");
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
    const { router } = setup({ findings: FINDINGS, total: 50 });
    await waitForListToLoad();

    await userEvent.click(screen.getByLabelText("Next page"));

    expect(getUrlQuery(router)).toEqual({ page: "1" });
  });

  it("clamps a page that no longer exists after a refetch", async () => {
    const { router } = setup({
      urlParams: { page: "1" },
      getResponse: (url) =>
        createMockListStaleFindingsResponse({
          data:
            new URL(url, "http://localhost").searchParams.get("offset") === "25"
              ? []
              : FINDINGS,
          total: 2,
        }),
    });

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({});
      expect(getLastRequestUrl().searchParams.get("offset")).toBe("0");
    });
    expect(await screen.findByText("Sales overview")).toBeInTheDocument();
  });

  it("clears the page parameter when navigating back to the first page", async () => {
    const { router } = setup({
      findings: FINDINGS,
      total: 50,
      urlParams: { page: "1" },
    });
    await waitForListToLoad();

    await userEvent.click(screen.getByLabelText("Previous page"));

    expect(getUrlQuery(router)).toEqual({});
  });

  it("refetches the stale endpoint with the next offset and renders the next page", async () => {
    const secondPageFinding = createMockContentDiagnosticsStaleFinding({
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

  it("resets pagination when table sorting changes", async () => {
    const { router } = setup({
      findings: FINDINGS,
      total: 50,
      urlParams: { page: "1" },
    });
    await waitForListToLoad();

    expect(getLastRequestUrl().searchParams.get("offset")).toBe("25");

    await userEvent.click(screen.getByRole("columnheader", { name: "Type" }));

    await waitFor(() => {
      expect(getLastRequestUrl().searchParams.get("sort-column")).toBe(
        "entity-type",
      );
    });
    expect(getLastRequestUrl().searchParams.get("sort-direction")).toBe("asc");
    expect(getLastRequestUrl().searchParams.get("offset")).toBe("0");
    expect(getUrlQuery(router)).toEqual({
      "sort-column": "entity-type",
      "sort-direction": "asc",
    });
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

  it("clears the filters and the search box from the Filter popover", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { query: "revenue", "entity-types": ["dashboard"] },
    });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Reset to defaults",
      }),
    );

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({});
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue("");
    const searchParams = getLastRequestUrl().searchParams;
    expect(searchParams.get("query")).toBeNull();
    expect(searchParams.getAll("entity-types")).toEqual([]);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "content_diagnostics_filters_reset",
      triggered_from: "stale",
    });
  });

  it("offers nothing to reset while the filters and search are untouched", async () => {
    setup({ findings: FINDINGS });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );

    expect(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Reset to defaults",
      }),
    ).toBeDisabled();
  });

  it("filters by personal collections server-side via the Location toggle", async () => {
    const { router } = setup({ findings: FINDINGS });
    await waitForListToLoad();

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
      expect(getUrlQuery(router)).toEqual({
        "include-personal-collections": "false",
      });
    });
    expect(
      getLastRequestUrl().searchParams.get("include-personal-collections"),
    ).toBe("false");
  });

  it("reflects the staleness threshold from the URL and sends changes made in the Filter popover", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { "threshold-days": "90" },
    });
    await waitForListToLoad();

    expect(getLastRequestUrl().searchParams.get("threshold-days")).toBe("90");

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    const input = within(popover).getByDisplayValue("90 days or more");

    await userEvent.click(input);
    await userEvent.click(
      await within(popover).findByRole("option", { name: "1 year or more" }),
    );

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({
        "threshold-days": "365",
      });
    });
    expect(getLastRequestUrl().searchParams.get("threshold-days")).toBe("365");

    await userEvent.click(within(popover).getByLabelText("Clear"));

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({});
    });
    expect(
      within(popover).getByPlaceholderText("Any length of time"),
    ).toHaveValue("");
  });

  it("puts the entity types in the URL and persists them when Dashboards is unchecked", async () => {
    const { router } = setup({ findings: FINDINGS });
    await waitForListToLoad();

    const popover = await openFilterPicker();
    await userEvent.click(
      within(popover).getByRole("checkbox", { name: "Dashboards" }),
    );

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({
        "entity-types": DASHBOARDS_DROPPED,
      });
    });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(REMEMBERED_FILTER_PATH, {
          method: "PUT",
        }),
      ).not.toHaveLength(0);
    });
    const [putCall] = fetchMock.callHistory.calls(REMEMBERED_FILTER_PATH, {
      method: "PUT",
    });
    expect(JSON.parse(String(putCall.options.body))).toEqual({
      value: { entity_types: DASHBOARDS_DROPPED },
    });
  });

  it("restores the last-used filter when the URL has no params", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: {},
      lastUsedParams: { entity_types: DASHBOARDS_DROPPED },
    });

    await waitForListToLoad();

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({
        "entity-types": DASHBOARDS_DROPPED,
      });
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual(
      DASHBOARDS_DROPPED,
    );
    const popover = await openFilterPicker();
    expect(
      within(popover).getByRole("checkbox", { name: "Dashboards" }),
    ).not.toBeChecked();
    expect(
      within(popover).getByRole("checkbox", { name: "Questions" }),
    ).toBeChecked();
  });

  it("prefers URL params over the last-used filter", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { "entity-types": ["dashboard"] },
      lastUsedParams: { entity_types: DASHBOARDS_DROPPED },
    });

    await waitForListToLoad();
    // let the remembered filter load, so a late overwrite would fail below
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(REMEMBERED_FILTER_PATH, { method: "GET" }),
      ).toHaveLength(1);
    });
    await fetchMock.callHistory.flush(true);

    expect(getUrlQuery(router)).toEqual({
      "entity-types": "dashboard",
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual([
      "dashboard",
    ]);
    const popover = await openFilterPicker();
    expect(
      within(popover).getByRole("checkbox", { name: "Dashboards" }),
    ).toBeChecked();
    expect(
      within(popover).getByRole("checkbox", { name: "Questions" }),
    ).not.toBeChecked();
  });

  it("lets an explicit default-valued URL win over the last-used filter", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { page: "0", "include-personal-collections": "true" },
      lastUsedParams: { entity_types: ["model"] },
    });

    await waitForListToLoad();

    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual([]);
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
      urlParams: { "entity-types": ["model"] },
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

  it("resets to all entity types when the last selected type is deselected", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { "entity-types": ["model"] },
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
  describe("sorting", () => {
    it.each([
      ["Name", "name"],
      ["Type", "entity-type"],
      ["Location", "collection-name"],
      ["Created by", "created-by"],
      ["Created at", "created-at"],
      ["Last active", "last-active-at"],
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
  });
});

describe("StaleContentPage findings by entity type", () => {
  const JUNE_15_2020 = "2020-06-15T12:00:00Z";

  const DATED_FINDINGS = [
    createMockContentDiagnosticsStaleFinding({
      id: 1,
      entity_type: "card",
      entity_id: 101,
      entity_display_name: "Old question",
      last_active_at: JUNE_15_2020,
    }),
    createMockContentDiagnosticsStaleFinding({
      id: 2,
      entity_type: "dashboard",
      entity_id: 102,
      entity_display_name: "Old dashboard",
      last_active_at: JUNE_15_2020,
    }),
    createMockContentDiagnosticsStaleFinding({
      id: 3,
      entity_type: "document",
      entity_id: 103,
      entity_display_name: "Old document",
      last_active_at: JUNE_15_2020,
    }),
  ];

  it("lists stale questions, dashboards and documents with their last activity date", async () => {
    setup({ findings: DATED_FINDINGS });

    const list = await screen.findByRole("treegrid");
    for (const name of ["Old question", "Old dashboard", "Old document"]) {
      expect(await within(list).findByText(name)).toBeInTheDocument();
    }
    expect(within(list).getAllByText("June 15, 2020")).toHaveLength(3);
  });

  it.each([
    ["Old question", "Last used"],
    ["Old dashboard", "Last viewed"],
    ["Old document", "Last viewed"],
  ])(
    "opens the sidebar for %s with the %s label and date",
    async (name, label) => {
      setup({ findings: DATED_FINDINGS });

      const list = await screen.findByRole("treegrid");
      await userEvent.click(await within(list).findByText(name));

      const sidebar = await screen.findByTestId("content-diagnostics-sidebar");
      expect(within(sidebar).getByText(label)).toBeInTheDocument();
      expect(within(sidebar).getByText("June 15, 2020")).toBeInTheDocument();
    },
  );

  it("lists a stale transform and shows its last run in the sidebar", async () => {
    setup({
      findings: [
        createMockContentDiagnosticsStaleFinding({
          id: 5,
          entity_type: "transform",
          entity_id: 55,
          entity_display_name: "Old transform",
          last_active_at: JUNE_15_2020,
        }),
      ],
    });

    const list = await screen.findByRole("treegrid");
    await userEvent.click(await within(list).findByText("Old transform"));

    const sidebar = await screen.findByTestId("content-diagnostics-sidebar");
    expect(within(sidebar).getByText("Last run")).toBeInTheDocument();
    expect(within(sidebar).getByText("June 15, 2020")).toBeInTheDocument();
  });

  it("permanently deletes a selected transform, shows an undo toast and refetches the list", async () => {
    let findings = [
      createMockContentDiagnosticsStaleFinding({
        id: 5,
        entity_type: "transform",
        entity_id: 55,
        entity_display_name: "Doomed transform",
      }),
    ];
    fetchMock.delete("path:/api/transform/55", () => {
      // the refetch after deletion must no longer include the transform
      findings = [];
      return 204;
    });
    setup({
      withUndos: true,
      getResponse: () =>
        createMockListStaleFindingsResponse({
          data: findings,
          total: findings.length,
        }),
    });

    await screen.findByText("Doomed transform");
    await userEvent.click(
      within(getFindingRow("Doomed transform")).getByRole("checkbox"),
    );

    const bar = screen.getByTestId("content-diagnostics-bulk-actions");
    expect(within(bar).getByText("1 item selected")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Delete" })).toBeEnabled();
    expect(
      within(bar).queryByRole("button", { name: "Move to trash" }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(bar).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete 1 transform?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "1 transform will be permanently deleted and cannot be restored.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/transform/55", {
          method: "DELETE",
        }),
      ).toHaveLength(1);
    });
    expect(await screen.findByText("Deleted 1 item")).toBeInTheDocument();
    expect(
      await screen.findByText("No stale content found"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Doomed transform")).not.toBeInTheDocument();
  });
});

function getUrlQuery(router: TestRouter | undefined) {
  return parseSearchQuery(router?.location.search ?? "");
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

async function openFilterPicker() {
  await userEvent.click(
    screen.getByTestId("content-diagnostics-filter-button"),
  );
  return screen.findByRole("dialog");
}

async function waitForListToLoad() {
  expect(await screen.findByRole("treegrid")).toBeInTheDocument();
}

function getFindingRow(name: string) {
  const row = within(screen.getByRole("treegrid", { hidden: true }))
    .getAllByRole("row", { hidden: true })
    .find((row) => within(row).queryByText(name));
  if (row === undefined) {
    throw new Error(`Expected finding row: ${name}`);
  }
  return row;
}

async function confirmBulkAction(name: string) {
  await userEvent.click(screen.getByRole("button", { name }));
  await userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name }),
  );
}
