import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ReactNode } from "react";

import {
  setupGetOAuthClientEndpoint,
  setupGetOAuthClientNotFoundEndpoint,
  setupListOAuthClientsEndpoint,
  setupListOAuthClientsErrorEndpoint,
  setupOAuthAuthorizationsEndpoint,
  setupPropertiesEndpoints,
  setupRevokeOAuthClientsEndpoint,
  setupRevokeOAuthClientsErrorEndpoint,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { getMonitorRoutes } from "metabase/monitor/routes";
import { PLUGIN_MONITOR } from "metabase/plugins";
import { resetPluginSlots } from "metabase/plugins/slot";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { getOAuthClientManagementRoutes } from "metabase-enterprise/monitor/oauth-client-management/routes";
import type {
  ListOAuthAuthorizationsResponse,
  OAuthClient,
  OAuthClientDetail,
  OAuthClientListResponse,
  RevokeOAuthClientsResponse,
  UserListResult,
} from "metabase-types/api";
import {
  createMockListOAuthAuthorizationsResponse,
  createMockOAuthAuthorization,
  createMockOAuthClient,
  createMockOAuthClientDetail,
  createMockOAuthClientRevoker,
  createMockOAuthClientUser,
  createMockRevokeOAuthClientsResponse,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
  createMockUserListResult,
} from "metabase-types/api/mocks";

import { OAuthClientsPage } from "./OAuthClientsPage";
import { PAGE_SIZE } from "./constants";

type MockCell = {
  id: string;
  column: { columnDef: { cell?: unknown } };
  getContext: () => unknown;
};

type MockHeader = {
  id: string;
  column: {
    columnDef: { header?: unknown };
    getCanSort: () => boolean;
    getToggleSortingHandler: () => (() => void) | undefined;
  };
  getContext: () => unknown;
};

type MockTreeTableRow = {
  id: string;
  getCanSelect: () => boolean;
  getIsSelected: () => boolean;
  toggleSelected: () => void;
  getVisibleCells: () => MockCell[];
};

type MockTreeTableInstance = {
  table: {
    getRowModel: () => { rows: MockTreeTableRow[] };
    getHeaderGroups: () => { id: string; headers: MockHeader[] }[];
  };
};

// TreeTable virtualizes its rows, which renders nothing in jsdom. Mock it to
// render each row's cells and the column headers via flexRender, plus the
// selection checkboxes it would draw.
jest.mock("metabase/ui/components/data-display/TreeTable/TreeTable", () => {
  const { flexRender } = jest.requireActual("@tanstack/react-table");
  return {
    TreeTable: ({
      instance,
      emptyState,
      showCheckboxes,
      headerCheckboxAriaLabel,
      onHeaderCheckboxClick,
      onRowClick,
      getRowProps,
    }: {
      instance: MockTreeTableInstance;
      emptyState: ReactNode;
      showCheckboxes?: boolean;
      headerCheckboxAriaLabel?: string;
      onHeaderCheckboxClick?: () => void;
      onRowClick?: (row: MockTreeTableRow) => void;
      getRowProps?: (row: MockTreeTableRow) => Record<string, unknown>;
    }) => {
      const rows = instance.table.getRowModel().rows;
      if (rows.length === 0) {
        return <div>{emptyState}</div>;
      }
      return (
        <div>
          {showCheckboxes && (
            <button
              aria-label={headerCheckboxAriaLabel}
              onClick={onHeaderCheckboxClick}
            />
          )}
          {instance.table.getHeaderGroups().map((group) => (
            <div key={group.id}>
              {group.headers.map((header) => (
                <span key={header.id} role="columnheader">
                  {header.column.getCanSort() ? (
                    // the real header is a button when the column sorts; render one so a spec can click it
                    <button onClick={header.column.getToggleSortingHandler()}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </button>
                  ) : (
                    flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )
                  )}
                </span>
              ))}
            </div>
          ))}
          {rows.map((row) => (
            <div
              key={row.id}
              role="row"
              onClick={() => onRowClick?.(row)}
              {...getRowProps?.(row)}
            >
              {showCheckboxes && row.getCanSelect() && (
                <button
                  aria-label={
                    row.getIsSelected() ? "Deselect row" : "Select row"
                  }
                  // the real table's checkbox does not also activate the row
                  onClick={(event) => {
                    event.stopPropagation();
                    row.toggleSelected();
                  }}
                />
              )}
              {row.getVisibleCells().map((cell) => (
                <span key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    },
  };
});

// MonitorContent is here for the sidebar's portal; AppSwitcher and the resize handle are not what is under test.
jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => null,
}));

jest.mock("react-resizable", () => ({
  ResizableBox: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const PATHNAME = Urls.monitorOAuthClients();

type SetupOpts = {
  clients?: OAuthClient[];
  listOverrides?: Partial<OAuthClientListResponse>;
  listError?: boolean;
  details?: OAuthClientDetail[];
  detailNotFoundFor?: string;
  activity?: ListOAuthAuthorizationsResponse;
  revokeResponse?: RevokeOAuthClientsResponse;
  revokeError?: boolean;
  initialRoute?: string;
  users?: UserListResult[];
};

const FILTERABLE_USER = createMockUserListResult({
  id: 7,
  common_name: "Rasta Toucan",
});

const setup = ({
  clients = [createMockOAuthClient()],
  listOverrides = {},
  listError = false,
  details = [],
  detailNotFoundFor,
  activity = createMockListOAuthAuthorizationsResponse({ data: [] }),
  revokeResponse,
  revokeError = false,
  initialRoute = PATHNAME,
  users = [FILTERABLE_USER],
}: SetupOpts = {}) => {
  if (listError) {
    setupListOAuthClientsErrorEndpoint();
  } else {
    setupListOAuthClientsEndpoint(clients, listOverrides);
  }

  details.forEach(setupGetOAuthClientEndpoint);
  if (detailNotFoundFor) {
    setupGetOAuthClientNotFoundEndpoint(detailNotFoundFor);
  }
  setupOAuthAuthorizationsEndpoint(activity);

  if (revokeError) {
    setupRevokeOAuthClientsErrorEndpoint();
  } else {
    setupRevokeOAuthClientsEndpoint(revokeResponse);
  }

  setupUsersEndpoints(users);

  const page = (
    <MonitorContent>
      <OAuthClientsPage />
      <UndoListing />
    </MonitorContent>
  );

  return renderWithProviders(
    <Route path={PATHNAME}>
      <Route index element={page} />
      <Route path=":clientId" element={page} />
    </Route>,
    { withRouter: true, initialRoute },
  );
};

const LIST_PATH = "path:/api/ee/oauth-client-management";
const REVOKE_PATH = "path:/api/ee/oauth-client-management/revoke";

const lastListCallUrl = () => {
  const calls = fetchMock.callHistory.calls(LIST_PATH);
  return calls[calls.length - 1]?.url ?? "";
};

/** The table card, once the request has settled and the loading skeleton has given way to the rows. */
const findLoadedTable = async () => {
  const table = await screen.findByTestId("oauth-clients-table");
  await waitFor(() => expect(table).toHaveAttribute("aria-busy", "false"));
  return table;
};

const lastActivityCallUrl = () => {
  const calls = fetchMock.callHistory.calls("path:/api/oauth/authorizations");
  return calls[calls.length - 1]?.url ?? "";
};

const lastRevokeBody = () => {
  const calls = fetchMock.callHistory.calls(REVOKE_PATH);
  const call = calls[calls.length - 1];
  return call === undefined ? undefined : JSON.parse(String(call.options.body));
};

describe("OAuthClientsPage", () => {
  it("lists the active clients with their columns", async () => {
    setup({
      clients: [
        createMockOAuthClient({
          client_name: "Claude Code",
          client_id: "client-abc",
          redirect_uris: ["https://claude.ai/cb"],
          user_count: 3,
          live_tokens: 5,
        }),
      ],
    });

    const table = await findLoadedTable();

    expect(within(table).getByText("Claude Code")).toBeInTheDocument();
    expect(within(table).getByText("client-abc")).toBeInTheDocument();
    expect(within(table).getByText("https://claude.ai/cb")).toBeInTheDocument();
    expect(within(table).getByText("3")).toBeInTheDocument();
    expect(within(table).getByText("5")).toBeInTheDocument();
  });

  it.each([null, ""])(
    "names a client registered with %p as its name",
    async (client_name) => {
      setup({ clients: [createMockOAuthClient({ client_name })] });

      const table = await findLoadedTable();

      expect(within(table).getByText("Unnamed client")).toBeInTheDocument();
    },
  );

  it("shows the Active tab's empty state when nothing is registered", async () => {
    setup({ clients: [] });

    const table = await findLoadedTable();

    expect(within(table).getByText("No active clients")).toBeInTheDocument();
  });

  it("asks for the active clients and the five Active columns by default", async () => {
    setup();

    const table = await findLoadedTable();

    expect(lastListCallUrl()).toContain("status=active");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "Client",
      "Redirect URIs",
      "Users",
      "Live tokens",
      "Registered",
    ]);
  });

  it("switches to the Revoked tab, keeping it in the URL", async () => {
    const { router } = setup({
      clients: [
        createMockOAuthClient({
          status: "revoked",
          revoked_at: "2026-09-20T09:00:00Z",
          revoked_by: createMockOAuthClientRevoker({
            common_name: "Ada Admin",
          }),
          live_tokens: 0,
          user_count: 0,
        }),
      ],
    });

    await findLoadedTable();
    await userEvent.click(screen.getByTestId("oauth-clients-tab-revoked"));

    await waitFor(() => expect(lastListCallUrl()).toContain("status=revoked"));
    // the URL write is debounced, so it lands after the request the state change already triggered
    await waitFor(() =>
      expect(router?.location.search).toContain("tab=revoked"),
    );

    const table = await findLoadedTable();
    expect(
      screen.getByText("Revoked clients are kept on record."),
    ).toBeInTheDocument();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual([
      "Client",
      "Redirect URIs",
      "Registered",
      "Revoked",
      "Revoked by",
    ]);
    expect(within(table).getByText("Ada Admin")).toBeInTheDocument();
  });

  it("shows the Revoked tab's empty state", async () => {
    setup({ clients: [], initialRoute: `${PATHNAME}?tab=revoked` });

    const table = await findLoadedTable();

    expect(
      within(table).getByText("Clients you revoke will appear here."),
    ).toBeInTheDocument();
  });

  it("offers no selection on the Revoked tab, where there is nothing left to revoke", async () => {
    setup({
      clients: [createMockOAuthClient({ status: "revoked" })],
      initialRoute: `${PATHNAME}?tab=revoked`,
    });

    const table = await findLoadedTable();

    expect(
      within(table).queryByRole("button", { name: "Select row" }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole("button", { name: "Select all" }),
    ).not.toBeInTheDocument();
  });

  it("will not let the caller select the client it is acting through", async () => {
    setup({
      clients: [
        createMockOAuthClient({ client_id: "client-current", current: true }),
        createMockOAuthClient({ client_id: "client-other" }),
      ],
    });

    await findLoadedTable();

    const currentRow = screen.getByTestId("oauth-client-row-client-current");
    const otherRow = screen.getByTestId("oauth-client-row-client-other");
    expect(
      within(currentRow).queryByRole("button", { name: "Select row" }),
    ).not.toBeInTheDocument();
    expect(
      within(otherRow).getByRole("button", { name: "Select row" }),
    ).toBeInTheDocument();
  });

  it("shows the bulk action bar once a row is selected, and clears it again", async () => {
    setup({ clients: [createMockOAuthClient()] });

    const table = await findLoadedTable();
    await userEvent.click(
      within(table).getByRole("button", { name: "Select row" }),
    );

    expect(await screen.findByText("1 client selected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.queryByText("1 client selected")).not.toBeInTheDocument();
  });

  it("clears the selection when the tab changes", async () => {
    setup({ clients: [createMockOAuthClient()] });

    const table = await findLoadedTable();
    await userEvent.click(
      within(table).getByRole("button", { name: "Select row" }),
    );
    expect(await screen.findByText("1 client selected")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("oauth-clients-tab-revoked"));

    await waitFor(() =>
      expect(screen.queryByText("1 client selected")).not.toBeInTheDocument(),
    );
  });

  it("clears the selection when the page changes", async () => {
    setup({
      clients: [createMockOAuthClient()],
      listOverrides: { total: PAGE_SIZE * 3, limit: PAGE_SIZE, offset: 0 },
    });

    const table = await findLoadedTable();
    await userEvent.click(
      within(table).getByRole("button", { name: "Select row" }),
    );
    expect(await screen.findByText("1 client selected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() =>
      expect(screen.queryByText("1 client selected")).not.toBeInTheDocument(),
    );
  });

  it("confirms a single revoke by naming the client", async () => {
    setup({ clients: [createMockOAuthClient({ client_name: "Claude Code" })] });

    const table = await findLoadedTable();
    await userEvent.click(
      within(table).getByRole("button", { name: "Select row" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));

    const modal = await screen.findByTestId("confirm-modal");
    expect(within(modal).getByText("Revoke this client?")).toBeInTheDocument();
    expect(
      within(modal).getByText(
        "Claude Code will lose access for everyone who connected it, and will need to be approved again. This can't be undone.",
      ),
    ).toBeInTheDocument();
  });

  it("confirms a multiple revoke by counting the clients", async () => {
    setup({
      clients: [
        createMockOAuthClient({ client_id: "client-1" }),
        createMockOAuthClient({ client_id: "client-2" }),
      ],
    });

    const table = await findLoadedTable();
    await userEvent.click(
      within(table).getByRole("button", { name: "Select all" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));

    const modal = await screen.findByTestId("confirm-modal");
    expect(within(modal).getByText("Revoke 2 clients?")).toBeInTheDocument();
    expect(
      within(modal).getByText(
        "Everyone who connected them will lose access, and each client will need to be approved again. This can't be undone.",
      ),
    ).toBeInTheDocument();
  });

  it("revokes the selected clients, reports how many, and clears the selection", async () => {
    setup({
      clients: [createMockOAuthClient({ client_id: "client-1" })],
      revokeResponse: createMockRevokeOAuthClientsResponse({ revoked: 1 }),
    });

    const table = await findLoadedTable();
    const listCallsBefore = fetchMock.callHistory.calls(LIST_PATH).length;
    await userEvent.click(
      within(table).getByRole("button", { name: "Select row" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const modal = await screen.findByTestId("confirm-modal");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Revoke" }),
    );

    expect(await screen.findByText("Revoked 1 client")).toBeInTheDocument();
    expect(lastRevokeBody()).toEqual({ ids: ["client-1"] });
    expect(screen.queryByText("1 client selected")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.callHistory.calls(LIST_PATH).length).toBeGreaterThan(
        listCallsBefore,
      ),
    );
  });

  it("warns when a client registered while the revoke was running", async () => {
    setup({
      clients: [createMockOAuthClient()],
      revokeResponse: createMockRevokeOAuthClientsResponse({
        revoked: 2,
        remaining: 1,
      }),
    });

    const table = await findLoadedTable();
    await userEvent.click(
      within(table).getByRole("button", { name: "Select row" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const modal = await screen.findByTestId("confirm-modal");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Revoke" }),
    );

    expect(await screen.findByText("Revoked 2 clients")).toBeInTheDocument();
    expect(
      await screen.findByText("1 new client registered while revoking"),
    ).toBeInTheDocument();
  });

  it("reports a failed revoke", async () => {
    setup({ clients: [createMockOAuthClient()], revokeError: true });

    const table = await findLoadedTable();
    await userEvent.click(
      within(table).getByRole("button", { name: "Select row" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    const modal = await screen.findByTestId("confirm-modal");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Revoke" }),
    );

    expect(
      await screen.findByText("Could not revoke clients."),
    ).toBeInTheDocument();
  });

  it("pages through the clients, keeping the page in the URL and showing the total", async () => {
    const total = PAGE_SIZE * 3;
    const { router } = setup({
      clients: [createMockOAuthClient()],
      listOverrides: { total, limit: PAGE_SIZE, offset: 0 },
    });

    await findLoadedTable();
    expect(screen.getByTestId("pagination-total")).toHaveTextContent(
      String(total),
    );

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() =>
      expect(lastListCallUrl()).toContain(`offset=${PAGE_SIZE}`),
    );
    expect(router?.location.search).toContain("page=1");
  });

  it.each([
    { search: "?page=2", status: "active", page: 2 },
    { search: "?tab=revoked&page=1", status: "revoked", page: 1 },
  ])(
    "asks for the page and status named by $search on mount",
    async ({ search, status, page }) => {
      setup({
        clients: [],
        initialRoute: `${PATHNAME}${search}`,
        listOverrides: { total: PAGE_SIZE * 5 },
      });

      await findLoadedTable();

      const url = lastListCallUrl();
      expect(url).toContain(`status=${status}`);
      expect(url).toContain(`limit=${PAGE_SIZE}`);
      expect(url).toContain(`offset=${page * PAGE_SIZE}`);
    },
  );

  it("searches by name, client ID or redirect URI, and sends the terms as `query`", async () => {
    const { router } = setup({ clients: [createMockOAuthClient()] });

    await findLoadedTable();
    await userEvent.type(
      screen.getByPlaceholderText("Search by name, client ID or redirect URI…"),
      "reporting bot",
    );

    await waitFor(() =>
      expect(lastListCallUrl()).toContain("query=reporting+bot"),
    );
    await waitFor(() =>
      expect(router?.location.search).toContain("query=reporting+bot"),
    );
  });

  it("starts the search again from the first page", async () => {
    setup({
      clients: [createMockOAuthClient()],
      listOverrides: { total: PAGE_SIZE * 3, limit: PAGE_SIZE, offset: 0 },
      initialRoute: `${PATHNAME}?page=2`,
    });

    await findLoadedTable();
    await userEvent.type(
      screen.getByPlaceholderText("Search by name, client ID or redirect URI…"),
      "claude",
    );

    await waitFor(() => expect(lastListCallUrl()).toContain("query=claude"));
    expect(lastListCallUrl()).toContain("offset=0");
  });

  it("filters by when a client registered and by who connected it, back on the first page", async () => {
    const { router } = setup({
      clients: [createMockOAuthClient()],
      listOverrides: { total: PAGE_SIZE * 3, limit: PAGE_SIZE, offset: 0 },
      initialRoute: `${PATHNAME}?page=2`,
    });

    await findLoadedTable();
    await userEvent.click(screen.getByRole("button", { name: "Show filters" }));
    await userEvent.click(screen.getByPlaceholderText("Any time"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Past week" }),
    );
    await userEvent.click(screen.getByPlaceholderText("Any user"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Rasta Toucan" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(lastListCallUrl()).toContain("user-id=7"));
    expect(lastListCallUrl()).toContain("registered-after=");
    expect(lastListCallUrl()).toContain("offset=0");
    await waitFor(() =>
      expect(router?.location.search).toContain("registered=week"),
    );
    expect(router?.location.search).toContain("user=7");
    expect(router?.location.search).not.toContain("page=2");
  });

  it("clears the filters, back on the first page", async () => {
    const { router } = setup({
      clients: [createMockOAuthClient()],
      listOverrides: { total: PAGE_SIZE * 3, limit: PAGE_SIZE, offset: 0 },
      initialRoute: `${PATHNAME}?page=2&registered=week&user=7`,
    });

    await findLoadedTable();
    await userEvent.click(screen.getByRole("button", { name: "Show filters" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );

    await waitFor(() =>
      expect(lastListCallUrl()).not.toContain("registered-after="),
    );
    expect(lastListCallUrl()).not.toContain("user-id=");
    expect(lastListCallUrl()).toContain("offset=0");
    await waitFor(() =>
      expect(router?.location.search).not.toContain("registered=week"),
    );
    expect(router?.location.search).not.toContain("user=7");
    expect(router?.location.search).not.toContain("page=2");
  });

  it("offers the registered window on the Revoked tab but not the user filter, which can never match there", async () => {
    setup({
      clients: [createMockOAuthClient({ status: "revoked" })],
      initialRoute: `${PATHNAME}?tab=revoked`,
    });

    await findLoadedTable();
    await userEvent.click(screen.getByRole("button", { name: "Show filters" }));

    expect(screen.getByPlaceholderText("Any time")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Any user")).not.toBeInTheDocument();
  });

  it("does not ask the endpoint to filter by user on the Revoked tab", async () => {
    setup({
      clients: [createMockOAuthClient({ status: "revoked" })],
      initialRoute: `${PATHNAME}?tab=revoked&user=7`,
    });

    await findLoadedTable();

    expect(lastListCallUrl()).toContain("status=revoked");
    expect(lastListCallUrl()).not.toContain("user-id=");
  });

  it("sorts on a count header largest first, then smallest, keeping the sort in the URL", async () => {
    const { router } = setup({
      clients: [createMockOAuthClient()],
      listOverrides: { total: PAGE_SIZE * 3, limit: PAGE_SIZE, offset: 0 },
      initialRoute: `${PATHNAME}?page=2`,
    });

    const table = await findLoadedTable();
    await userEvent.click(within(table).getByRole("button", { name: "Users" }));

    await waitFor(() =>
      expect(lastListCallUrl()).toContain("sort-column=user_count"),
    );
    expect(lastListCallUrl()).toContain("sort-direction=desc");
    expect(lastListCallUrl()).toContain("offset=0");
    await waitFor(() =>
      expect(router?.location.search).toContain("sort_column=user_count"),
    );
    expect(router?.location.search).not.toContain("page=2");

    await userEvent.click(within(table).getByRole("button", { name: "Users" }));

    await waitFor(() =>
      expect(lastListCallUrl()).toContain("sort-direction=asc"),
    );
  });

  it("sorts the name header A-Z first, where largest-first would read backwards", async () => {
    setup({ clients: [createMockOAuthClient()] });

    const table = await findLoadedTable();
    await userEvent.click(
      within(table).getByRole("button", { name: "Client" }),
    );

    await waitFor(() =>
      expect(lastListCallUrl()).toContain("sort-column=client_name"),
    );
    expect(lastListCallUrl()).toContain("sort-direction=asc");
  });

  it("offers no sort on the columns the endpoint cannot order by", async () => {
    setup({ clients: [createMockOAuthClient()] });

    const table = await findLoadedTable();

    expect(
      within(table).queryByRole("button", { name: "Redirect URIs" }),
    ).not.toBeInTheDocument();
    expect(
      within(table).getByRole("button", { name: "Registered" }),
    ).toBeInTheDocument();
  });

  it("sorts the Revoked tab by when each client was revoked", async () => {
    setup({
      clients: [createMockOAuthClient({ status: "revoked" })],
      initialRoute: `${PATHNAME}?tab=revoked`,
    });

    const table = await findLoadedTable();
    await userEvent.click(
      within(table).getByRole("button", { name: "Revoked" }),
    );

    await waitFor(() =>
      expect(lastListCallUrl()).toContain("sort-column=revoked_at"),
    );
  });

  it.each([
    {
      name: "the search",
      act: async () => {
        await userEvent.type(
          screen.getByPlaceholderText(
            "Search by name, client ID or redirect URI…",
          ),
          "x",
        );
      },
    },
    {
      name: "a filter",
      act: async () => {
        await userEvent.click(
          screen.getByRole("button", { name: "Show filters" }),
        );
        await userEvent.click(screen.getByPlaceholderText("Any time"));
        await userEvent.click(
          await screen.findByRole("option", { name: "Past day" }),
        );
        await userEvent.click(screen.getByRole("button", { name: "Apply" }));
      },
    },
    {
      name: "the sort",
      act: async () => {
        await userEvent.click(screen.getByRole("button", { name: "Users" }));
      },
    },
  ])("clears the selection when $name changes", async ({ act }) => {
    setup({ clients: [createMockOAuthClient()] });

    const table = await findLoadedTable();
    await userEvent.click(
      within(table).getByRole("button", { name: "Select row" }),
    );
    expect(await screen.findByText("1 client selected")).toBeInTheDocument();

    await act();

    await waitFor(() =>
      expect(screen.queryByText("1 client selected")).not.toBeInTheDocument(),
    );
  });

  it("revokes every active client from the Active tab, with the all-variant copy and an empty body", async () => {
    setup({
      clients: [createMockOAuthClient()],
      revokeResponse: createMockRevokeOAuthClientsResponse({ revoked: 4 }),
    });

    await findLoadedTable();
    await userEvent.click(
      screen.getByRole("button", { name: "Revoke all clients" }),
    );

    const modal = await screen.findByTestId("confirm-modal");
    expect(
      within(modal).getByText("Revoke all OAuth clients?"),
    ).toBeInTheDocument();
    expect(
      within(modal).getByText(
        "Every connected client will lose access and need to be approved again. This can't be undone.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(modal).getByRole("button", { name: "Revoke" }),
    );

    expect(await screen.findByText("Revoked 4 clients")).toBeInTheDocument();
    expect(lastRevokeBody()).toEqual({});
  });

  it("offers nothing to revoke all of on the Revoked tab, or when nothing is registered", async () => {
    setup({
      clients: [createMockOAuthClient({ status: "revoked" })],
      initialRoute: `${PATHNAME}?tab=revoked`,
    });

    await findLoadedTable();

    expect(
      screen.queryByRole("button", { name: "Revoke all clients" }),
    ).not.toBeInTheDocument();
  });

  it("keeps Revoke all clients available while a search narrows the list away, since it ignores the filters", async () => {
    setup({
      clients: [],
      listOverrides: { total: 0 },
      initialRoute: `${PATHNAME}?query=nothing-matches-this`,
    });

    await findLoadedTable();

    expect(
      screen.getByRole("button", { name: "Revoke all clients" }),
    ).toBeEnabled();
  });

  it("marks the client the caller is acting through, and only that one", async () => {
    setup({
      clients: [
        createMockOAuthClient({ client_id: "client-current", current: true }),
        createMockOAuthClient({ client_id: "client-other" }),
      ],
    });

    await findLoadedTable();

    const currentRow = screen.getByTestId("oauth-client-row-client-current");
    const otherRow = screen.getByTestId("oauth-client-row-client-other");
    expect(within(currentRow).getByText("This client")).toBeInTheDocument();
    expect(within(otherRow).queryByText("This client")).not.toBeInTheDocument();
  });

  it("renders no rows when the list request fails", async () => {
    setup({ listError: true });

    await waitFor(() =>
      expect(lastListCallUrl()).toContain("/api/ee/oauth-client-management"),
    );
    expect(screen.queryByRole("row")).not.toBeInTheDocument();
    expect(screen.queryByText("No active clients")).not.toBeInTheDocument();
  });

  describe("the client detail sidebar", () => {
    const CLIENT_ID = "client-abc";

    /**
     * Re-queried on every use rather than held: the sidebar is portalled, and a list refetch can replace the node a
     * held reference points at, which leaves the assertion querying a detached subtree.
     */
    const sidebar = () => screen.getByTestId("oauth-client-detail-sidebar");

    const openSidebar = async () => {
      await findLoadedTable();
      await userEvent.click(
        screen.getByTestId(`oauth-client-row-${CLIENT_ID}`),
      );
      await screen.findByTestId("oauth-client-detail-sidebar");
      // The sidebar opens on the row and the detail lands on top of it, so until a section is rendered it is still
      // the loading state. Waiting here, with room for a loaded machine, is what keeps every assertion below
      // reading a settled sidebar rather than racing those two requests.
      await screen.findByTestId("oauth-client-details", undefined, {
        timeout: 10000,
      });
    };

    it("opens on the clicked client at its own URL, keeping the list's URL state", async () => {
      const { router } = setup({
        clients: [
          createMockOAuthClient({
            client_id: CLIENT_ID,
            client_name: "Claude Code",
          }),
        ],
        details: [
          createMockOAuthClientDetail({
            client_id: CLIENT_ID,
            client_name: "Claude Code",
          }),
        ],
        listOverrides: { total: PAGE_SIZE * 2 },
        initialRoute: `${PATHNAME}?page=1`,
      });

      await openSidebar();

      expect(within(sidebar()).getByText("Claude Code")).toBeInTheDocument();
      await waitFor(() =>
        expect(router?.location.pathname).toBe(`${PATHNAME}/${CLIENT_ID}`),
      );
      expect(router?.location.search).toContain("page=1");
    });

    it("shows what the client registered, including the scopes and contacts only the detail carries", async () => {
      setup({
        clients: [createMockOAuthClient({ client_id: CLIENT_ID })],
        details: [
          createMockOAuthClientDetail({
            client_id: CLIENT_ID,
            client_uri: "https://bot.example.com",
            contacts: ["ops@bot.example.com"],
            application_type: "native",
            registration_type: "dynamic",
            redirect_uris: ["https://bot.example.com/cb"],
            scopes: ["mb:full", "agent:question:create"],
          }),
        ],
      });

      await openSidebar();

      // the row the list already had is shown first, so the detail's own fields are what settles last
      expect(
        await within(sidebar()).findByText("agent:question:create"),
      ).toBeInTheDocument();
      expect(within(sidebar()).getByText("Details")).toBeInTheDocument();
      expect(within(sidebar()).getByText(CLIENT_ID)).toBeInTheDocument();
      expect(
        within(sidebar()).getByText("https://bot.example.com"),
      ).toBeInTheDocument();
      expect(
        within(sidebar()).getByText("ops@bot.example.com"),
      ).toBeInTheDocument();
      expect(within(sidebar()).getByText("native")).toBeInTheDocument();
      expect(within(sidebar()).getByText("Dynamic")).toBeInTheDocument();
      expect(
        within(sidebar()).getByText("https://bot.example.com/cb"),
      ).toBeInTheDocument();
      expect(within(sidebar()).getByText("mb:full")).toBeInTheDocument();
    });

    it("names each consenting user with how many live tokens they hold and when they last approved", async () => {
      setup({
        clients: [createMockOAuthClient({ client_id: CLIENT_ID })],
        details: [
          createMockOAuthClientDetail({
            client_id: CLIENT_ID,
            users: [
              createMockOAuthClientUser({
                id: 1,
                common_name: "Ada Admin",
                live_tokens: 2,
                last_approved_at: "2026-09-20T12:00:00Z",
              }),
              createMockOAuthClientUser({
                id: 2,
                common_name: null,
                email: "bo@example.com",
                live_tokens: 1,
                last_approved_at: null,
              }),
            ],
          }),
        ],
      });

      await openSidebar();

      expect(await within(sidebar()).findByText("Users")).toBeInTheDocument();
      expect(
        await within(sidebar()).findByText("Ada Admin"),
      ).toBeInTheDocument();
      expect(within(sidebar()).getByText("2 live tokens")).toBeInTheDocument();
      expect(within(sidebar()).getByText("Last approved")).toBeInTheDocument();
      // no name on record, so the user is named by the address a warning would go to
      expect(within(sidebar()).getByText("bo@example.com")).toBeInTheDocument();
      expect(within(sidebar()).getByText("1 live token")).toBeInTheDocument();
      expect(
        within(sidebar()).getByText("No approval on record"),
      ).toBeInTheDocument();
    });

    it("says so when nobody is connected through the client", async () => {
      setup({
        clients: [createMockOAuthClient({ client_id: CLIENT_ID })],
        details: [
          createMockOAuthClientDetail({ client_id: CLIENT_ID, users: [] }),
        ],
      });

      await openSidebar();

      expect(
        await within(sidebar()).findByText(
          "Nobody is connected through this client right now.",
        ),
      ).toBeInTheDocument();
    });

    it("says nobody is connected only once the detail has landed", async () => {
      const detail = createMockOAuthClientDetail({
        client_id: CLIENT_ID,
        users: [],
      });
      // The detail is held until this test releases it, rather than delayed by a timer: what is under test is the
      // order of two states, and a timer would make that a race with the renderer.
      let landDetail: () => void = () => undefined;
      const pendingDetail = new Promise<OAuthClientDetail>((resolve) => {
        landDetail = () => resolve(detail);
      });
      // registered before setup, which leaves this path alone when it is given no details
      fetchMock.get(
        `path:/api/ee/oauth-client-management/${CLIENT_ID}`,
        pendingDetail,
      );
      setup({
        clients: [createMockOAuthClient({ client_id: CLIENT_ID })],
        initialRoute: `${PATHNAME}/${CLIENT_ID}`,
      });

      const users = await screen.findByTestId("oauth-client-users");

      // the row the list handed over carries a count, not users, so there is nothing to say yet
      expect(
        within(users).queryByText(
          "Nobody is connected through this client right now.",
        ),
      ).not.toBeInTheDocument();

      landDetail();

      expect(
        await within(users).findByText(
          "Nobody is connected through this client right now.",
        ),
      ).toBeInTheDocument();
    });

    it("shows the client's own history, asking the authorization log for just this client", async () => {
      setup({
        clients: [createMockOAuthClient({ client_id: CLIENT_ID })],
        details: [createMockOAuthClientDetail({ client_id: CLIENT_ID })],
        activity: createMockListOAuthAuthorizationsResponse({
          data: [
            createMockOAuthAuthorization({
              id: 2,
              event_type: "approved",
              user_email: "ada@example.com",
              created_at: "2026-09-20T12:00:00Z",
            }),
            createMockOAuthAuthorization({
              id: 1,
              event_type: "registered",
              user_email: null,
              created_at: "2026-09-01T12:00:00Z",
            }),
          ],
          total: 2,
        }),
      });

      await openSidebar();

      // scoped to the section: "Registered" is also a Details label, for when the client registered
      const activity = await within(sidebar()).findByTestId(
        "oauth-client-activity",
      );
      expect(await within(activity).findByText("Approved")).toBeInTheDocument();
      expect(within(activity).getByText("ada@example.com")).toBeInTheDocument();
      expect(lastActivityCallUrl()).toContain(`client-id=${CLIENT_ID}`);
      // newest first, as the endpoint returns them: the approval is above the registration it followed
      expect(
        within(activity)
          .getAllByText(/^(Approved|Registered)$/)
          .map((label) => label.textContent),
      ).toEqual(["Approved", "Registered"]);
    });

    it("says so when the client has no history", async () => {
      setup({
        clients: [createMockOAuthClient({ client_id: CLIENT_ID })],
        details: [createMockOAuthClientDetail({ client_id: CLIENT_ID })],
        activity: createMockListOAuthAuthorizationsResponse({
          data: [],
          total: 0,
        }),
      });

      await openSidebar();

      expect(
        await within(sidebar()).findByText(
          "No activity on record for this client.",
        ),
      ).toBeInTheDocument();
    });

    it("shows when a revoked client went and who revoked it, and offers no revoke", async () => {
      setup({
        clients: [
          createMockOAuthClient({
            client_id: CLIENT_ID,
            status: "revoked",
            revoked_at: "2026-09-20T09:00:00Z",
            revoked_by: createMockOAuthClientRevoker({
              common_name: "Ada Admin",
            }),
            live_tokens: 0,
            user_count: 0,
          }),
        ],
        details: [
          createMockOAuthClientDetail({
            client_id: CLIENT_ID,
            status: "revoked",
            revoked_at: "2026-09-20T09:00:00Z",
            revoked_by: createMockOAuthClientRevoker({
              common_name: "Ada Admin",
            }),
            live_tokens: 0,
            user_count: 0,
            users: [],
          }),
        ],
        initialRoute: `${PATHNAME}?tab=revoked`,
      });

      await openSidebar();

      expect(await within(sidebar()).findByText("Revoked")).toBeInTheDocument();
      expect(within(sidebar()).getByText("Revoked by")).toBeInTheDocument();
      expect(within(sidebar()).getByText("Ada Admin")).toBeInTheDocument();
      expect(
        within(sidebar()).queryByRole("button", { name: "Revoke client" }),
      ).not.toBeInTheDocument();
    });

    it("offers no revoke on the client the caller is acting through", async () => {
      setup({
        clients: [
          createMockOAuthClient({ client_id: CLIENT_ID, current: true }),
        ],
        details: [
          createMockOAuthClientDetail({ client_id: CLIENT_ID, current: true }),
        ],
      });

      await openSidebar();

      expect(await within(sidebar()).findByText("Details")).toBeInTheDocument();
      expect(
        within(sidebar()).queryByRole("button", { name: "Revoke client" }),
      ).not.toBeInTheDocument();
    });

    it("steps through the clients on the page with previous and next", async () => {
      const { router } = setup({
        clients: [
          createMockOAuthClient({ client_id: "client-1" }),
          createMockOAuthClient({ client_id: CLIENT_ID }),
          createMockOAuthClient({ client_id: "client-3" }),
        ],
        details: [
          createMockOAuthClientDetail({ client_id: "client-1" }),
          createMockOAuthClientDetail({ client_id: CLIENT_ID }),
          createMockOAuthClientDetail({ client_id: "client-3" }),
        ],
      });

      await openSidebar();

      await userEvent.click(
        within(sidebar()).getByRole("button", { name: "Next client" }),
      );
      await waitFor(() =>
        expect(router?.location.pathname).toBe(`${PATHNAME}/client-3`),
      );

      await userEvent.click(
        within(sidebar()).getByRole("button", { name: "Previous client" }),
      );
      await waitFor(() =>
        expect(router?.location.pathname).toBe(`${PATHNAME}/${CLIENT_ID}`),
      );
    });

    it("stops stepping at the ends of the page", async () => {
      setup({
        clients: [createMockOAuthClient({ client_id: CLIENT_ID })],
        details: [createMockOAuthClientDetail({ client_id: CLIENT_ID })],
      });

      await openSidebar();

      expect(
        within(sidebar()).getByRole("button", { name: "Previous client" }),
      ).toBeDisabled();
      expect(
        within(sidebar()).getByRole("button", { name: "Next client" }),
      ).toBeDisabled();
    });

    it("closes back to the list with the page and tab intact", async () => {
      const { router } = setup({
        clients: [createMockOAuthClient({ client_id: CLIENT_ID })],
        details: [createMockOAuthClientDetail({ client_id: CLIENT_ID })],
        listOverrides: { total: PAGE_SIZE * 2 },
        initialRoute: `${PATHNAME}?page=1`,
      });

      await openSidebar();
      await userEvent.click(
        within(sidebar()).getByRole("button", { name: "Close" }),
      );

      await waitFor(() => expect(router?.location.pathname).toBe(PATHNAME));
      expect(router?.location.search).toContain("page=1");
      expect(
        screen.queryByTestId("oauth-client-detail-sidebar"),
      ).not.toBeInTheDocument();
    });

    it("revokes the client from its footer with the single-client copy, then closes", async () => {
      const { router } = setup({
        clients: [
          createMockOAuthClient({
            client_id: CLIENT_ID,
            client_name: "Claude Code",
          }),
        ],
        details: [
          createMockOAuthClientDetail({
            client_id: CLIENT_ID,
            client_name: "Claude Code",
          }),
        ],
        revokeResponse: createMockRevokeOAuthClientsResponse({ revoked: 1 }),
      });

      await openSidebar();
      await userEvent.click(
        await within(sidebar()).findByRole("button", { name: "Revoke client" }),
      );

      const modal = await screen.findByTestId("confirm-modal");
      expect(
        within(modal).getByText("Revoke this client?"),
      ).toBeInTheDocument();
      expect(
        within(modal).getByText(
          "Claude Code will lose access for everyone who connected it, and will need to be approved again. This can't be undone.",
        ),
      ).toBeInTheDocument();

      await userEvent.click(
        within(modal).getByRole("button", { name: "Revoke" }),
      );

      expect(await screen.findByText("Revoked 1 client")).toBeInTheDocument();
      expect(lastRevokeBody()).toEqual({ ids: [CLIENT_ID] });
      await waitFor(() => expect(router?.location.pathname).toBe(PATHNAME));
      expect(
        screen.queryByTestId("oauth-client-detail-sidebar"),
      ).not.toBeInTheDocument();
    });

    it("reports a client that is no longer registered", async () => {
      setup({
        clients: [],
        detailNotFoundFor: CLIENT_ID,
        initialRoute: `${PATHNAME}/${CLIENT_ID}`,
      });

      await screen.findByTestId("oauth-client-detail-sidebar");

      expect(
        await within(sidebar()).findByText(
          "This client is no longer registered.",
        ),
      ).toBeInTheDocument();
    });

    it("says so even while the list still has the row, because the server has contradicted it", async () => {
      setup({
        clients: [
          createMockOAuthClient({
            client_id: CLIENT_ID,
            client_name: "Claude Code",
          }),
        ],
        detailNotFoundFor: CLIENT_ID,
        initialRoute: `${PATHNAME}/${CLIENT_ID}`,
      });

      await screen.findByTestId("oauth-client-detail-sidebar");

      expect(
        await within(sidebar()).findByText(
          "This client is no longer registered.",
        ),
      ).toBeInTheDocument();
      expect(
        within(sidebar()).queryByTestId("oauth-client-details"),
      ).not.toBeInTheDocument();
      expect(
        within(sidebar()).queryByTestId("oauth-client-users"),
      ).not.toBeInTheDocument();
      expect(
        within(sidebar()).queryByRole("button", { name: "Revoke client" }),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * The real `monitor/routes.tsx` subtree, so the branch an admin actually hits is what gets exercised: the plugin's
   * page when the feature installs its routes, the OSS upsell when it does not, and the shared access guard either
   * way.
   */
  describe("the Monitor route", () => {
    afterEach(() => {
      resetPluginSlots();
    });

    const setupMonitorRoute = ({
      isLicensed,
      isAdmin = true,
    }: {
      isLicensed: boolean;
      isAdmin?: boolean;
    }) => {
      const tokenFeatures = createMockTokenFeatures({
        "session-management": isLicensed,
      });

      setupListOAuthClientsEndpoint([]);
      setupSettingsEndpoints([]);
      setupPropertiesEndpoints(
        createMockSettings({ "token-features": tokenFeatures }),
      );
      setupUserKeyValueEndpoints({
        namespace: "monitor",
        key: "isNavbarOpened",
        value: true,
      });

      if (isLicensed) {
        PLUGIN_MONITOR.isOAuthClientManagementEnabled = true;
        PLUGIN_MONITOR.getOAuthClientManagementRoutes =
          getOAuthClientManagementRoutes;
      }

      return renderWithProviders(
        <>
          {getMonitorRoutes()}
          <Route path="/unauthorized" element={<div>{"unauthorized"}</div>} />
        </>,
        {
          storeInitialState: createMockState({
            currentUser: createMockUser({ is_superuser: isAdmin }),
            settings: mockSettings({
              "has-user-setup": true,
              "token-features": tokenFeatures,
            }),
          }),
          withRouter: true,
          initialRoute: PATHNAME,
        },
      );
    };

    it("renders the page when the feature installs its routes", async () => {
      setupMonitorRoute({ isLicensed: true });

      expect(
        await screen.findByTestId("oauth-clients-table"),
      ).toBeInTheDocument();
    });

    it("renders the upsell page without the session-management feature", async () => {
      setupMonitorRoute({ isLicensed: false });

      expect(
        await screen.findByText(
          "See which programs can act as your users, and cut one off",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("oauth-clients-table"),
      ).not.toBeInTheDocument();
    });

    it("keeps a non-admin off the page", async () => {
      const { router } = setupMonitorRoute({
        isLicensed: true,
        isAdmin: false,
      });

      await waitFor(() =>
        expect(router?.location.pathname).toBe("/unauthorized"),
      );
      expect(
        screen.queryByTestId("oauth-clients-table"),
      ).not.toBeInTheDocument();
    });

    it("keeps a non-admin off the upsell page too", async () => {
      const { router } = setupMonitorRoute({
        isLicensed: false,
        isAdmin: false,
      });

      await waitFor(() =>
        expect(router?.location.pathname).toBe("/unauthorized"),
      );
    });
  });
});
