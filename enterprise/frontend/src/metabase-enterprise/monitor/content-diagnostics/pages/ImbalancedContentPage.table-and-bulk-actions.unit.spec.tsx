import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupContentDiagnosticsCountsEndpoint,
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
import { Outlet, Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  ContentDiagnosticsImbalancedFinding,
  ContentDiagnosticsImbalancedFindingType,
  ContentDiagnosticsImbalancedUnit,
  ListImbalancedFindingsResponse,
} from "metabase-types/api";
import {
  createMockContentDiagnosticsImbalancedFinding,
  createMockUser,
} from "metabase-types/api/mocks";

import { getContentDiagnosticsRoutes } from "../routes";

const IMBALANCED_ENDPOINT = "path:/api/ee/content-diagnostics/imbalanced";
const INVALIDATE_ENDPOINT = "path:/api/ee/content-diagnostics/invalidate";
const PAGE_SIZE = 25;

type FakeFinding = ContentDiagnosticsImbalancedFinding & {
  isPersonal?: boolean;
};

type FindingOpts = {
  id: number;
  name: string;
  entityType?: ContentDiagnosticsImbalancedFinding["entity_type"];
  type?: ContentDiagnosticsImbalancedFindingType;
  count?: number;
  unit?: ContentDiagnosticsImbalancedUnit;
  canWrite?: boolean;
  isPersonal?: boolean;
};

function createFinding({
  id,
  name,
  entityType = "dashboard",
  type = "empty",
  count = 0,
  unit = "dashcards",
  canWrite = true,
  isPersonal = false,
}: FindingOpts): FakeFinding {
  return {
    ...createMockContentDiagnosticsImbalancedFinding({
      id,
      entity_id: id * 10,
      entity_type: entityType,
      entity_display_name: name,
      finding_type: type,
      content_count: count,
      can_write: canWrite,
      details: { unit },
    }),
    isPersonal,
  };
}

/**
 * A tiny in-memory stand-in for GET /api/ee/content-diagnostics/imbalanced that honours the
 * finding-type, query, entity-types, include-personal-collections, sort and paging params.
 */
function createFakeServer(initialFindings: FakeFinding[]) {
  const findings = [...initialFindings];
  const removeFindingsOfEntities = (entityIds: number[]) => {
    for (let i = findings.length - 1; i >= 0; i--) {
      if (entityIds.includes(findings[i].entity_id)) {
        findings.splice(i, 1);
      }
    }
  };

  const list = (url: string): ListImbalancedFindingsResponse => {
    const params = new URL(url, "http://localhost").searchParams;
    const query = params.get("query")?.toLowerCase();
    const entityTypes = params.getAll("entity-types");
    const includePersonal = params.get("include-personal-collections");
    const sortColumn = params.get("sort-column");
    const sortDirection = params.get("sort-direction");
    const offset = Number(params.get("offset") ?? 0);

    const matching = findings
      .filter((f) => f.finding_type === params.get("finding-types"))
      .filter(
        (f) =>
          query == null ||
          (f.entity_display_name ?? "").toLowerCase().includes(query),
      )
      .filter(
        (f) => entityTypes.length === 0 || entityTypes.includes(f.entity_type),
      )
      .filter((f) => includePersonal !== "false" || !f.isPersonal);

    if (sortColumn === "name") {
      matching.sort((a, b) =>
        (a.entity_display_name ?? "").localeCompare(
          b.entity_display_name ?? "",
        ),
      );
      if (sortDirection === "desc") {
        matching.reverse();
      }
    }

    return {
      data: matching.slice(offset, offset + PAGE_SIZE),
      total: matching.length,
      limit: PAGE_SIZE,
      offset,
      last_scan_at: "2026-06-01T00:00:00Z",
    };
  };

  fetchMock.get(IMBALANCED_ENDPOINT, ({ url }) => list(url));
  return { removeFindingsOfEntities };
}

function setupArchiveEndpoints(
  server: ReturnType<typeof createFakeServer>,
  entityIds: number[],
) {
  for (const id of entityIds) {
    fetchMock.put(`path:/api/dashboard/${id}`, (call) => {
      const body = JSON.parse(String(call.options.body));
      // trashing an entity invalidates its findings on the backend
      server.removeFindingsOfEntities([id]);
      return { id, archived: true, ...body };
    });
  }
}

function setup({
  findings,
  initialRoute = Urls.imbalancedContent("empty"),
}: {
  findings: FakeFinding[];
  initialRoute?: string;
}) {
  const server = createFakeServer(findings);
  setupContentDiagnosticsCountsEndpoint();
  for (const key of ["empty", "sparse", "crowded"] as const) {
    setupUserKeyValueEndpoints({
      namespace: "content_diagnostics",
      key,
      value: {},
    });
  }
  mockGetBoundingClientRect({ width: 100, height: 100 });

  const result = renderWithProviders(
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
      withUndos: true,
      initialRoute,
      storeInitialState: { currentUser: createMockUser() },
    },
  );
  return { ...result, server };
}

const getList = () => screen.findByTestId("imbalanced-content-list");

function getRow(name: string) {
  const row = screen.getByText(name).closest<HTMLElement>('[role="row"]');
  if (!row) {
    throw new Error(`No row for ${name}`);
  }
  return row;
}

const getRowCheckbox = (name: string) =>
  within(getRow(name)).getByRole("checkbox");

const getRequestParams = () =>
  new URL(
    String(fetchMock.callHistory.lastCall(IMBALANCED_ENDPOINT)?.url),
    "http://localhost",
  ).searchParams;

const hasUndo = (store: ReturnType<typeof setup>["store"], message: string) =>
  store.getState().undo.some((undo) => undo.message === message);

const dashboardPutCalls = () =>
  fetchMock.callHistory
    .calls()
    .filter(
      ({ options, url }) =>
        options.method === "PUT" && url.includes("/api/dashboard/"),
    );

const FIRST = createFinding({ id: 1, name: "E2E first dashboard" });
const SECOND = createFinding({ id: 2, name: "E2E second dashboard" });

describe("ImbalancedContentPage > rendering returned findings", () => {
  it("renders every returned entity type (ARC-1, EM-1, PE-3, RS-1)", async () => {
    setup({
      findings: [
        createFinding({
          id: 11,
          name: "Live collection",
          entityType: "collection",
          unit: "items",
        }),
        FIRST,
        createFinding({
          id: 13,
          name: "Live document",
          entityType: "document",
          unit: "cards",
        }),
        createFinding({
          id: 14,
          name: "Empty question",
          entityType: "card",
          unit: "rows",
        }),
      ],
    });

    const list = await getList();
    expect(
      await within(list).findByText("Live collection"),
    ).toBeInTheDocument();
    expect(within(list).getByText("E2E first dashboard")).toBeInTheDocument();
    expect(within(list).getByText("Live document")).toBeInTheDocument();
    expect(within(list).getByText("Empty question")).toBeInTheDocument();
  });

  it("renders refetched data once a finding disappears (RS-2/3)", async () => {
    const { server } = setup({ findings: [FIRST, SECOND] });
    await within(await getList()).findByText("E2E first dashboard");

    server.removeFindingsOfEntities([FIRST.entity_id]);
    await userEvent.type(screen.getByLabelText("Search"), "e2e");

    await waitFor(() => {
      expect(screen.queryByText("E2E first dashboard")).not.toBeInTheDocument();
    });
    expect(screen.getByText("E2E second dashboard")).toBeInTheDocument();
  });
});

describe("ImbalancedContentPage > bulk dismiss", () => {
  it("dismisses the selected findings without trashing their content (BD-1..7)", async () => {
    const { server, store } = setup({ findings: [FIRST, SECOND] });
    fetchMock.post(INVALIDATE_ENDPOINT, () => {
      server.removeFindingsOfEntities([FIRST.entity_id, SECOND.entity_id]);
      return { invalidated: [1, 2], skipped: [] };
    });
    setupArchiveEndpoints(server, [FIRST.entity_id, SECOND.entity_id]);

    await within(await getList()).findByText("E2E first dashboard");
    await userEvent.click(getRowCheckbox("E2E first dashboard"));
    await userEvent.click(getRowCheckbox("E2E second dashboard"));

    const bar = screen.getByTestId("content-diagnostics-bulk-actions");
    expect(within(bar).getByText("2 items selected")).toBeInTheDocument();
    await userEvent.click(
      within(bar).getByRole("button", { name: "Dismiss findings" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Dismiss 2 findings?")).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Dismiss findings" }),
    );

    await waitFor(() => {
      expect(hasUndo(store, "Dismissed 2 findings")).toBe(true);
    });
    expect(await screen.findByText("Dismissed 2 findings")).toBeInTheDocument();
    const calls = fetchMock.callHistory.calls(INVALIDATE_ENDPOINT);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].options.body))).toEqual({ ids: [1, 2] });

    expect(
      await screen.findByText("No empty content found"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("content-diagnostics-bulk-actions"),
    ).not.toBeInTheDocument();
    expect(dashboardPutCalls()).toHaveLength(0);
  });
});

describe("ImbalancedContentPage > bulk trash", () => {
  it("moves the selected dashboards to the trash and drops them from the list (BT-1..4)", async () => {
    const { server, store } = setup({ findings: [FIRST, SECOND] });
    setupArchiveEndpoints(server, [FIRST.entity_id, SECOND.entity_id]);

    await within(await getList()).findByText("E2E first dashboard");
    await userEvent.click(getRowCheckbox("E2E first dashboard"));
    await userEvent.click(getRowCheckbox("E2E second dashboard"));

    const toast = screen.getByTestId("toast-card");
    expect(within(toast).getByText("2 items selected")).toBeInTheDocument();
    await userEvent.click(
      within(toast).getByRole("button", { name: "Move to trash" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Move 2 items to trash?"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Move to trash" }),
    );

    await waitFor(() => {
      expect(hasUndo(store, "Moved 2 items to the trash")).toBe(true);
    });
    expect(
      await screen.findByText("Moved 2 items to the trash"),
    ).toBeInTheDocument();
    const puts = dashboardPutCalls();
    expect(puts.map(({ url }) => new URL(url).pathname).sort()).toEqual([
      "/api/dashboard/10",
      "/api/dashboard/20",
    ]);
    for (const put of puts) {
      expect(JSON.parse(String(put.options.body))).toMatchObject({
        archived: true,
      });
    }

    // the refetched list no longer contains the trashed dashboards
    await waitFor(() => {
      expect(screen.queryByText("E2E first dashboard")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("E2E second dashboard")).not.toBeInTheDocument();
  });

  it("disables trash but keeps dismissal for a mixed write-permission selection (BT-5..7)", async () => {
    setup({
      findings: [
        createFinding({ id: 1, name: "Writable dashboard", canWrite: true }),
        createFinding({ id: 2, name: "Readable dashboard", canWrite: false }),
      ],
    });

    await within(await getList()).findByText("Writable dashboard");
    expect(getRowCheckbox("Writable dashboard")).toBeEnabled();
    expect(getRowCheckbox("Readable dashboard")).toBeEnabled();
    await userEvent.click(getRowCheckbox("Writable dashboard"));
    await userEvent.click(getRowCheckbox("Readable dashboard"));

    const bar = screen.getByTestId("content-diagnostics-bulk-actions");
    expect(
      within(bar).getByRole("button", { name: "Move to trash" }),
    ).toBeDisabled();
    expect(
      within(bar).getByRole("button", { name: "Dismiss findings" }),
    ).toBeEnabled();
  });
});

describe("ImbalancedContentPage > table operations", () => {
  const TOTAL_DASHBOARDS = 26;
  const dashboardName = (index: number) =>
    `E2E tableops dashboard ${String(index).padStart(2, "0")}`;
  const FINDINGS = [
    createFinding({
      id: 100,
      name: "E2E tableops collection",
      entityType: "collection",
      unit: "items",
    }),
    createFinding({ id: 101, name: "E2E zzdecoy dashboard" }),
    createFinding({
      id: 102,
      name: "E2E tableops personal dashboard",
      isPersonal: true,
    }),
    ...Array.from({ length: TOTAL_DASHBOARDS }, (_, index) =>
      createFinding({ id: index + 1, name: dashboardName(index + 1) }),
    ),
  ];
  const TOTAL_FINDINGS = TOTAL_DASHBOARDS + 2;

  async function search(term: string) {
    const input = screen.getByLabelText("Search");
    await userEvent.clear(input);
    await userEvent.type(input, term);
    await waitFor(() => expect(getRequestParams().get("query")).toBe(term));
  }

  async function toggleFilter(label: string) {
    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    const popover = await screen.findByRole("dialog");
    await userEvent.click(within(popover).getByLabelText(label));
    await userEvent.click(
      screen.getByTestId("content-diagnostics-filter-button"),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  }

  it("narrows the table by search, entity type and personal collections (TO-1..5)", async () => {
    setup({ findings: FINDINGS });
    const list = await getList();
    await within(list).findByText("E2E zzdecoy dashboard");

    await search("zzdecoy");
    await waitFor(() => {
      expect(
        within(list).queryByText(dashboardName(1)),
      ).not.toBeInTheDocument();
    });
    expect(within(list).getByText("E2E zzdecoy dashboard")).toBeInTheDocument();

    await search("tableops");
    await waitFor(() => {
      expect(screen.getByTestId("pagination-total")).toHaveTextContent(
        String(TOTAL_FINDINGS),
      );
    });
    expect(
      within(list).queryByText("E2E zzdecoy dashboard"),
    ).not.toBeInTheDocument();

    // unchecking Dashboards sends the remaining entity types to the server
    await toggleFilter("Dashboards");
    await waitFor(() => {
      expect(getRequestParams().getAll("entity-types")).not.toContain(
        "dashboard",
      );
    });
    expect(getRequestParams().getAll("entity-types")).toContain("collection");
    await waitFor(() => {
      expect(
        within(list).queryByText(dashboardName(1)),
      ).not.toBeInTheDocument();
    });
    expect(
      within(list).getByText("E2E tableops collection"),
    ).toBeInTheDocument();

    // re-checking Dashboards restores the default filter, which is served from the cache
    // (served from the RTK Query cache: no new request)
    const callCount = fetchMock.callHistory.calls(IMBALANCED_ENDPOINT).length;
    await toggleFilter("Dashboards");
    expect(await within(list).findByText(dashboardName(1))).toBeInTheDocument();
    expect(fetchMock.callHistory.calls(IMBALANCED_ENDPOINT)).toHaveLength(
      callCount,
    );

    // excluding personal collections sends the param and shrinks the total
    await toggleFilter("Include items in personal collections");
    await waitFor(() => {
      expect(getRequestParams().get("include-personal-collections")).toBe(
        "false",
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("pagination-total")).toHaveTextContent(
        String(TOTAL_FINDINGS - 1),
      );
    });
  });

  it("sorts by the Name header ascending, then descending (TO-6/7)", async () => {
    setup({ findings: FINDINGS });
    const list = await getList();
    await search("tableops");

    await userEvent.click(within(list).getByText("Name"));
    await waitFor(() => {
      expect(getRequestParams().get("sort-direction")).toBe("asc");
    });
    expect(getRequestParams().get("sort-column")).toBe("name");
    expect(await within(list).findByText(dashboardName(1))).toBeInTheDocument();
    expect(
      within(list).queryByText("E2E tableops personal dashboard"),
    ).not.toBeInTheDocument();

    await userEvent.click(within(list).getByText("Name"));
    await waitFor(() => {
      expect(getRequestParams().get("sort-direction")).toBe("desc");
    });
    expect(
      await within(list).findByText("E2E tableops personal dashboard"),
    ).toBeInTheDocument();
    expect(within(list).queryByText(dashboardName(1))).not.toBeInTheDocument();
  });

  it("loads the next page of results (TO-8)", async () => {
    setup({ findings: FINDINGS });
    const list = await getList();
    await search("tableops");
    await userEvent.click(within(list).getByText("Name"));
    expect(await within(list).findByText(dashboardName(1))).toBeInTheDocument();
    expect(within(list).queryByText(dashboardName(26))).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("next-page-btn"));

    await waitFor(() => {
      expect(getRequestParams().get("offset")).toBe(String(PAGE_SIZE));
    });
    expect(
      await within(list).findByText(dashboardName(26)),
    ).toBeInTheDocument();
    expect(within(list).queryByText(dashboardName(1))).not.toBeInTheDocument();
  });

  it("opens a sidebar for the clicked finding (TO-9)", async () => {
    setup({ findings: FINDINGS });
    const list = await getList();
    await search("tableops");
    await waitFor(() => {
      expect(screen.getByTestId("pagination-total")).toHaveTextContent(
        String(TOTAL_FINDINGS),
      );
    });

    await userEvent.click(within(list).getByText("E2E tableops collection"));

    const sidebar = await screen.findByTestId("content-diagnostics-sidebar");
    expect(
      within(sidebar).getByText("E2E tableops collection"),
    ).toBeInTheDocument();
    expect(within(sidebar).getByText("Content count")).toBeInTheDocument();
    expect(within(sidebar).getByText("0 items")).toBeInTheDocument();
  });

  it("starts a neighbouring tab clean, with no search, filters or sidebar (TO-10)", async () => {
    setup({ findings: FINDINGS });
    const list = await getList();
    await search("tableops");
    await toggleFilter("Dashboards");
    await waitFor(() => {
      expect(
        within(list).queryByText(dashboardName(1)),
      ).not.toBeInTheDocument();
    });
    await userEvent.click(within(list).getByText("E2E tableops collection"));
    expect(
      await screen.findByTestId("content-diagnostics-sidebar"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Sparse" }));

    expect(
      await screen.findByText("No sparse content found"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("content-diagnostics-sidebar"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toHaveValue("");
    expect(
      screen.getByTestId("content-diagnostics-filter-button"),
    ).toBeVisible();
    expect(
      screen.queryByTestId("content-diagnostics-filter-indicator"),
    ).not.toBeInTheDocument();
  });
});
