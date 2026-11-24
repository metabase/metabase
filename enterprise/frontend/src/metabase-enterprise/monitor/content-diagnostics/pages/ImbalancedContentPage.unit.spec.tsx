import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ComponentType } from "react";

import {
  setupContentDiagnosticsCountsEndpoint,
  setupInvalidateFindingsEndpoint,
  setupListImbalancedFindingsEndpoint,
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
import type { UrlStateQuery } from "metabase/common/hooks/use-url-state";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route, queryToSearch } from "metabase/router";
import * as Urls from "metabase/urls";
import { parseSearchQuery } from "metabase/utils/browser";
import type {
  ContentDiagnosticsImbalancedFinding,
  ContentDiagnosticsImbalancedFindingType,
  ContentDiagnosticsImbalancedUserParams,
  ListImbalancedFindingsResponse,
} from "metabase-types/api";
import {
  createMockContentDiagnosticsCollection,
  createMockContentDiagnosticsImbalancedFinding,
  createMockContentDiagnosticsUser,
  createMockDashboard,
  createMockListImbalancedFindingsResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  CrowdedContentPage,
  EmptyContentPage,
  SparseContentPage,
} from "./ImbalancedContentPage";

const PAGE_BY_MODE: Record<
  ContentDiagnosticsImbalancedFindingType,
  ComponentType
> = {
  empty: EmptyContentPage,
  sparse: SparseContentPage,
  crowded: CrowdedContentPage,
};

const FINDINGS: ContentDiagnosticsImbalancedFinding[] = [
  createMockContentDiagnosticsImbalancedFinding({
    id: 1,
    finding_type: "crowded",
    entity_type: "collection",
    entity_display_name: "Crowded collection",
    content_count: 150,
  }),
  createMockContentDiagnosticsImbalancedFinding({
    id: 2,
    finding_type: "crowded",
    entity_type: "dashboard",
    entity_display_name: "Busy dashboard",
    content_count: 42,
  }),
];

type SetupOpts = {
  mode?: ContentDiagnosticsImbalancedFindingType;
  findings?: ContentDiagnosticsImbalancedFinding[];
  total?: number;
  urlParams?: UrlStateQuery;
  lastUsedParams?: ContentDiagnosticsImbalancedUserParams;
  error?: boolean;
  getResponse?: (url: string) => ListImbalancedFindingsResponse;
  withUndos?: boolean;
};

function setup({
  mode = "crowded",
  findings = [],
  total,
  urlParams = {},
  lastUsedParams = {},
  error = false,
  getResponse,
  withUndos = false,
}: SetupOpts = {}) {
  if (error) {
    fetchMock.get("path:/api/ee/content-diagnostics/imbalanced", {
      status: 500,
      body: { message: "Imbalanced scan failed" },
    });
  } else if (getResponse) {
    fetchMock.get("path:/api/ee/content-diagnostics/imbalanced", ({ url }) =>
      getResponse(url),
    );
  } else {
    setupListImbalancedFindingsEndpoint(
      createMockListImbalancedFindingsResponse({
        data: findings,
        total: total ?? findings.length,
      }),
    );
  }

  setupUserKeyValueEndpoints({
    namespace: "content_diagnostics",
    key: mode,
    value: lastUsedParams,
  });

  setupContentDiagnosticsCountsEndpoint();
  mockGetBoundingClientRect({ width: 100, height: 100 });

  const Page = PAGE_BY_MODE[mode];
  const { router } = renderWithProviders(
    <Route
      path={Urls.imbalancedContent(mode)}
      element={
        <MonitorContent>
          <Page />
        </MonitorContent>
      }
    />,
    {
      withRouter: true,
      withUndos,
      initialRoute: `${Urls.imbalancedContent(mode)}${queryToSearch(urlParams)}`,
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
      fetchMock.callHistory.lastCall(
        "path:/api/ee/content-diagnostics/imbalanced",
      )?.url,
    ),
    "http://localhost",
  );
}

async function waitForListToLoad() {
  expect(await screen.findByRole("treegrid")).toBeInTheDocument();
}

describe("ImbalancedContentPage", () => {
  it("renders findings with their content counts in the table", async () => {
    setup({ findings: FINDINGS });

    const list = await screen.findByRole("treegrid");
    expect(
      await within(list).findByText("Crowded collection"),
    ).toBeInTheDocument();
    expect(within(list).getByText("Busy dashboard")).toBeInTheDocument();
    expect(within(list).getByText("150")).toBeInTheDocument();
    expect(within(list).getByText("42")).toBeInTheDocument();
  });

  it.each(["empty", "sparse"] as const)(
    "offers bulk-trash selection on the %s tab",
    async (mode) => {
      setup({
        mode,
        findings: [
          createMockContentDiagnosticsImbalancedFinding({ can_write: true }),
        ],
      });

      await screen.findByRole("treegrid");
      expect(await screen.findByLabelText("Select all")).toBeInTheDocument();
    },
  );

  it("offers dismissal without trash on the Crowded tab", async () => {
    setupInvalidateFindingsEndpoint({
      invalidated: [11],
      skipped: [],
    });
    setup({
      mode: "crowded",
      findings: [
        createMockContentDiagnosticsImbalancedFinding({
          id: 11,
          entity_id: 101,
          can_write: false,
        }),
      ],
    });

    await screen.findByRole("treegrid");
    await userEvent.click(screen.getByLabelText("Select all"));
    expect(
      screen.getByRole("button", { name: "Dismiss finding" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Move to trash" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss finding" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Dismiss finding",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId("content-diagnostics-bulk-actions"),
      ).not.toBeInTheDocument(),
    );
    const calls = fetchMock.callHistory.calls(
      "path:/api/ee/content-diagnostics/invalidate",
    );
    expect(calls).toHaveLength(1);
    const [call] = calls;
    const body: unknown = JSON.parse(String(call.options.body));
    expect(body).toEqual({ ids: [11] });
  });

  it("pins the finding type to the tab's problem type", async () => {
    setup({ mode: "crowded", findings: FINDINGS });
    await waitForListToLoad();
    expect(getLastRequestUrl().searchParams.getAll("finding-types")).toEqual([
      "crowded",
    ]);
  });

  it("pins a different finding type for another tab", async () => {
    setup({ mode: "empty", findings: [] });
    await waitFor(() => {
      expect(getLastRequestUrl().searchParams.getAll("finding-types")).toEqual([
        "empty",
      ]);
    });
  });

  it("shows a problem-specific empty state", async () => {
    setup({ mode: "sparse", findings: [] });

    expect(
      await screen.findByText("No sparse content found"),
    ).toBeInTheDocument();
  });

  it("renders the content count in the sidebar", async () => {
    const finding = createMockContentDiagnosticsImbalancedFinding({
      id: 1,
      finding_type: "crowded",
      entity_type: "collection",
      entity_id: 20,
      entity_display_name: "Executive dashboards",
      content_count: 150,
      details: {
        collection: createMockContentDiagnosticsCollection({
          id: 30,
          name: "Reporting",
        }),
        creator: createMockContentDiagnosticsUser({ name: "Grace Creator" }),
        threshold: 100,
        unit: "items",
      },
    });
    setup({ findings: [finding] });

    const list = await screen.findByRole("treegrid");
    await userEvent.click(
      await within(list).findByText("Executive dashboards"),
    );

    const sidebarRegion = await screen.findByTestId("monitor-sidebar-region");
    expect(sidebarRegion).toHaveTextContent("Grace Creator");
    expect(sidebarRegion).toHaveTextContent("150 items");
  });

  it("offers collections as an entity type and sends the selection to the server", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { "entity-types": ["dashboard"] },
    });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    const collectionsCheckbox = within(popover).getByRole("checkbox", {
      name: "Collections",
    });
    expect(collectionsCheckbox).not.toBeChecked();

    await userEvent.click(collectionsCheckbox);

    const expectedTypes = ["dashboard", "collection"];
    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({ "entity-types": expectedTypes });
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual(
      expectedTypes,
    );
  });

  it("sends the query parameter to the server when searching", async () => {
    setup({
      getResponse: (url) =>
        createMockListImbalancedFindingsResponse({
          data: url.includes("query=busy") ? [FINDINGS[1]] : FINDINGS,
          total: url.includes("query=busy") ? 1 : FINDINGS.length,
        }),
    });
    await waitForListToLoad();

    const input = screen.getByLabelText("Search");
    await userEvent.type(input, "busy");

    await waitFor(() => {
      expect(screen.queryByText("Crowded collection")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Busy dashboard")).toBeInTheDocument();
    expect(getLastRequestUrl().searchParams.get("query")).toBe("busy");
  });

  it("shows the error state and doesn't render the table when the request fails", async () => {
    setup({ error: true });

    expect(
      await screen.findByText("Imbalanced scan failed"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("treegrid")).not.toBeInTheDocument();
  });

  it("restores the last-used filter when the URL has no params", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: {},
      lastUsedParams: { sort_column: "created-at", sort_direction: "desc" },
    });

    await waitForListToLoad();

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({
        "sort-column": "created-at",
        "sort-direction": "desc",
      });
    });
    expect(getLastRequestUrl().searchParams.get("sort-column")).toBe(
      "created-at",
    );
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
      within(popover).getByRole("checkbox", { name: "Dashboards" }),
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
      urlParams: { "entity-types": ["dashboard"] },
    });
    await waitForListToLoad();

    await userEvent.click(screen.getByLabelText("Next page"));

    await waitFor(() => {
      expect(getLastRequestUrl().searchParams.get("offset")).toBe("25");
    });
    expect(getLastRequestUrl().searchParams.getAll("entity-types")).toEqual([
      "dashboard",
    ]);
  });

  it("resets to all entity types when the last selected type is deselected", async () => {
    const { router } = setup({
      findings: FINDINGS,
      urlParams: { "entity-types": ["dashboard"] },
    });
    await waitForListToLoad();

    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(
      within(popover).getByRole("checkbox", { name: "Dashboards" }),
    );

    await waitFor(() => {
      expect(getUrlQuery(router)).toEqual({});
    });
    const allEntityTypes = ["Dashboards", "Documents", "Collections"];
    allEntityTypes.forEach((label) => {
      expect(
        within(popover).getByRole("checkbox", { name: label }),
      ).toBeChecked();
    });
  });
  describe("sorting", () => {
    it("does not offer sorting by mixed-unit crowded content counts", async () => {
      const { router } = setup({
        findings: FINDINGS,
        urlParams: { "sort-column": "content-count" },
      });
      await waitForListToLoad();

      const header = screen.getByRole("columnheader", {
        name: /^Content count/,
      });
      expect(header).not.toHaveAttribute("aria-sort");
      await userEvent.click(header);
      expect(getUrlQuery(router)).toEqual({});
    });

    it("sorts empty content by its comparable count", async () => {
      const { router } = setup({ mode: "empty", findings: FINDINGS });
      await waitForListToLoad();

      await userEvent.click(
        screen.getByRole("columnheader", { name: /^Content count/ }),
      );
      await waitFor(() => {
        expect(getUrlQuery(router)).toEqual({
          "sort-column": "content-count",
          "sort-direction": "asc",
        });
      });
    });
    it.each([
      ["Name", "name"],
      ["Type", "entity-type"],
      ["Location", "collection-name"],
      ["Created by", "created-by"],
      ["Created at", "created-at"],
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

  describe("bulk actions on the Empty tab", () => {
    it("dismisses the selected findings and drops them from the searched list", async () => {
      const server = setupEmptyFindingsServer([
        createEmptyDashboardFinding(10, "Unrelated empty dashboard"),
        createEmptyDashboardFinding(11, "E2E dismissal first dashboard"),
        createEmptyDashboardFinding(12, "E2E dismissal second dashboard"),
      ]);
      setupInvalidateFindingsEndpoint(({ options }) => {
        const ids = getRequestIds(parseRequestBody(options.body));
        return { invalidated: server.remove(ids), skipped: [] };
      });
      setup({
        mode: "empty",
        getResponse: server.getResponse,
        withUndos: true,
      });

      await searchEmptyFindings("dismissal");
      await userEvent.click(getCheckbox("E2E dismissal first dashboard"));
      await userEvent.click(getCheckbox("E2E dismissal second dashboard"));

      const bulkActions = screen.getByTestId(
        "content-diagnostics-bulk-actions",
      );
      expect(within(bulkActions).getByText("2 items selected")).toBeVisible();
      await userEvent.click(
        within(bulkActions).getByRole("button", { name: "Dismiss findings" }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("Dismiss 2 findings?")).toBeVisible();
      const listRequestsBefore = getListRequestCount();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Dismiss findings" }),
      );

      await waitFor(() =>
        expect(screen.getByText("Dismissed 2 findings")).toBeVisible(),
      );
      expect(await screen.findByText("No empty content found")).toBeVisible();
      expect(
        screen.queryByTestId("content-diagnostics-bulk-actions"),
      ).not.toBeInTheDocument();
      const calls = fetchMock.callHistory.calls(
        "path:/api/ee/content-diagnostics/invalidate",
      );
      expect(calls).toHaveLength(1);
      expect(parseRequestBody(calls[0].options.body)).toEqual({
        ids: [11, 12],
      });
      // the list refetches with the same search after the dismissal
      expect(getListRequestCount()).toBeGreaterThan(listRequestsBefore);
      expect(getLastRequestUrl().searchParams.get("query")).toBe("dismissal");
      expect(getLastRequestUrl().searchParams.getAll("finding-types")).toEqual([
        "empty",
      ]);
      // dismissing never writes to the content itself
      expect(
        fetchMock.callHistory
          .calls()
          .filter(
            ({ options }) =>
              options.method === "PUT" || options.method === "DELETE",
          ),
      ).toHaveLength(0);
    });

    it("moves the selected findings to the trash and drops them from the list", async () => {
      const server = setupEmptyFindingsServer([
        createEmptyDashboardFinding(20, "Unrelated empty dashboard"),
        createEmptyDashboardFinding(21, "E2E trashing first dashboard"),
        createEmptyDashboardFinding(22, "E2E trashing second dashboard"),
      ]);
      [20, 21, 22].forEach((id) => setupArchiveDashboardEndpoint(id, server));
      setup({
        mode: "empty",
        getResponse: server.getResponse,
        withUndos: true,
      });

      await searchEmptyFindings("trashing");
      await userEvent.click(getCheckbox("E2E trashing first dashboard"));
      await userEvent.click(getCheckbox("E2E trashing second dashboard"));

      const toastCard = screen.getByTestId("toast-card");
      expect(within(toastCard).getByText("2 items selected")).toBeVisible();
      await userEvent.click(
        within(toastCard).getByRole("button", { name: "Move to trash" }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("Move 2 items to trash?")).toBeVisible();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Move to trash" }),
      );

      await waitFor(() =>
        expect(screen.getByText("Moved 2 items to the trash")).toBeVisible(),
      );
      const list = screen.getByTestId("imbalanced-content-list");
      await waitFor(() =>
        expect(list).not.toHaveTextContent("E2E trashing first dashboard"),
      );
      expect(list).not.toHaveTextContent("E2E trashing second dashboard");
      for (const entityId of [121, 122]) {
        const archiveCalls = fetchMock.callHistory.calls(
          `path:/api/dashboard/${entityId}`,
        );
        expect(archiveCalls).toHaveLength(1);
        expect(parseRequestBody(archiveCalls[0].options.body)).toMatchObject({
          archived: true,
        });
      }
      expect(
        fetchMock.callHistory.calls("path:/api/dashboard/120"),
      ).toHaveLength(0);
    });

    it("disables trash but not dismissal once a read-only finding is selected", async () => {
      const server = setupEmptyFindingsServer([
        createEmptyDashboardFinding(30, "E2E trashing writable dashboard"),
        createEmptyDashboardFinding(31, "E2E trashing readable dashboard", {
          can_write: false,
        }),
      ]);
      setup({ mode: "empty", getResponse: server.getResponse });

      await screen.findByText("E2E trashing readable dashboard");
      const writableCheckbox = getCheckbox("E2E trashing writable dashboard");
      const readableCheckbox = getCheckbox("E2E trashing readable dashboard");
      expect(writableCheckbox).toBeEnabled();
      expect(readableCheckbox).toBeEnabled();

      await userEvent.click(writableCheckbox);
      const bulkActions = screen.getByTestId(
        "content-diagnostics-bulk-actions",
      );
      expect(
        within(bulkActions).getByRole("button", { name: "Move to trash" }),
      ).toBeEnabled();

      await userEvent.click(readableCheckbox);
      expect(within(bulkActions).getByText("2 items selected")).toBeVisible();
      expect(
        within(bulkActions).getByRole("button", { name: "Move to trash" }),
      ).toBeDisabled();
      expect(
        within(bulkActions).getByRole("button", { name: "Dismiss findings" }),
      ).toBeEnabled();
    });
  });
});

function createEmptyDashboardFinding(
  id: number,
  name: string,
  opts: Partial<ContentDiagnosticsImbalancedFinding> = {},
) {
  return createMockContentDiagnosticsImbalancedFinding({
    id,
    finding_type: "empty",
    entity_type: "dashboard",
    entity_id: id + 100,
    entity_display_name: name,
    content_count: 0,
    ...opts,
  });
}

// Stands in for the findings store: the list endpoint filters by finding type
// and search query, and the write endpoints remove findings from it.
function setupEmptyFindingsServer(
  initialFindings: ContentDiagnosticsImbalancedFinding[],
) {
  let findings = initialFindings;
  return {
    getResponse: (url: string) => {
      const searchParams = new URL(url, "http://localhost").searchParams;
      const query = searchParams.get("query")?.toLowerCase() ?? "";
      const findingTypes = searchParams.getAll("finding-types");
      const data = findings.filter(
        (finding) =>
          findingTypes.includes(finding.finding_type) &&
          (finding.entity_display_name ?? "").toLowerCase().includes(query),
      );
      return createMockListImbalancedFindingsResponse({
        data,
        total: data.length,
      });
    },
    remove: (ids: number[]) => {
      const removedIds = findings
        .filter((finding) => ids.includes(finding.id))
        .map((finding) => finding.id);
      findings = findings.filter((finding) => !ids.includes(finding.id));
      return removedIds;
    },
    removeEntity: (entityId: number) => {
      findings = findings.filter((finding) => finding.entity_id !== entityId);
    },
  };
}

function setupArchiveDashboardEndpoint(
  findingId: number,
  server: ReturnType<typeof setupEmptyFindingsServer>,
) {
  const dashboardId = findingId + 100;
  fetchMock.put(`path:/api/dashboard/${dashboardId}`, ({ options }) => {
    const archived = isArchiveRequest(parseRequestBody(options.body));
    if (archived) {
      // the backend invalidates the findings of an archived entity
      server.removeEntity(dashboardId);
    }
    return createMockDashboard({ id: dashboardId, archived });
  });
}

async function searchEmptyFindings(query: string) {
  await screen.findByText("Unrelated empty dashboard");
  await userEvent.type(screen.getByLabelText("Search"), query);
  await waitFor(() =>
    expect(
      screen.queryByText("Unrelated empty dashboard"),
    ).not.toBeInTheDocument(),
  );
}

function getCheckbox(name: string) {
  const row = within(screen.getByTestId("imbalanced-content-list"))
    .getAllByRole("row")
    .find((row) => within(row).queryByText(name));
  if (row === undefined) {
    throw new Error(`Expected finding row: ${name}`);
  }
  return within(row).getByRole("checkbox");
}

function getListRequestCount() {
  return fetchMock.callHistory.calls(
    "path:/api/ee/content-diagnostics/imbalanced",
  ).length;
}

function parseRequestBody(body: unknown): unknown {
  return JSON.parse(String(body));
}

function getRequestIds(body: unknown): number[] {
  if (
    typeof body !== "object" ||
    body === null ||
    !("ids" in body) ||
    !Array.isArray(body.ids)
  ) {
    return [];
  }
  return body.ids.filter((id): id is number => typeof id === "number");
}

function isArchiveRequest(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "archived" in body &&
    body.archived === true
  );
}
