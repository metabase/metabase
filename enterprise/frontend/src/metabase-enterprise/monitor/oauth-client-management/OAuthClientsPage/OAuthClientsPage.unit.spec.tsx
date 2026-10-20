import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGetOAuthClientEndpoint,
  setupGetOAuthClientNotFoundEndpoint,
  setupListOAuthClientsEndpoint,
  setupListOAuthClientsErrorEndpoint,
  setupOAuthAuthorizationsEndpoint,
  setupRevokeOAuthClientsEndpoint,
  setupRevokeOAuthClientsErrorEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  OAuthClient,
  OAuthClientDetail,
  OAuthClientListResponse,
  RevokeOAuthClientsResponse,
  UserListResult,
} from "metabase-types/api";
import {
  createMockListOAuthAuthorizationsResponse,
  createMockOAuthClient,
  createMockOAuthClientDetail,
  createMockRevokeOAuthClientsResponse,
  createMockUserListResult,
} from "metabase-types/api/mocks";

import { OAuthClientsPage } from "./OAuthClientsPage";
import { PAGE_SIZE } from "./constants";

const PATHNAME = Urls.monitorOAuthClients();

type SetupOpts = {
  clients?: OAuthClient[];
  listOverrides?: Partial<OAuthClientListResponse>;
  listError?: boolean;
  details?: OAuthClientDetail[];
  detailNotFoundFor?: string;
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
  setupOAuthAuthorizationsEndpoint(
    createMockListOAuthAuthorizationsResponse({ data: [] }),
  );

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
const SEARCH_PLACEHOLDER = "Search by name, client ID or redirect URI…";
const PAGED = { total: PAGE_SIZE * 3, limit: PAGE_SIZE, offset: 0 };

const lastListCallUrl = () => {
  const calls = fetchMock.callHistory.calls(LIST_PATH);
  return calls[calls.length - 1]?.url ?? "";
};

const lastRevokeBody = () => {
  const calls = fetchMock.callHistory.calls(REVOKE_PATH);
  const call = calls[calls.length - 1];
  return call === undefined ? undefined : JSON.parse(String(call.options.body));
};

const findLoadedTable = async () => {
  const table = await screen.findByTestId("oauth-clients-table");
  await waitFor(() => expect(table).toHaveAttribute("aria-busy", "false"));
  return table;
};

const selectRow = async (clientId: string) =>
  userEvent.click(
    within(await screen.findByTestId(`oauth-client-row-${clientId}`)).getByRole(
      "checkbox",
    ),
  );

const selectAllRows = async () =>
  userEvent.click(
    within(await findLoadedTable()).getByRole("checkbox", {
      name: "Select all",
    }),
  );

const clickBulkRevoke = () =>
  userEvent.click(screen.getByRole("button", { name: "Revoke" }));

const clickRevokeAll = async () =>
  userEvent.click(
    await screen.findByRole("button", { name: "Revoke all clients" }),
  );

const confirmRevoke = async () =>
  userEvent.click(
    within(await screen.findByTestId("confirm-modal")).getByRole("button", {
      name: "Revoke",
    }),
  );

// the sorted column's name also carries its sort icon's label
const getHeader = (name: string) =>
  screen.getByRole("columnheader", {
    name: new RegExp(`^${name}(?: \\w+ icon)?$`),
  });

const clickHeader = (name: string) => userEvent.click(getHeader(name));

const applyFilter = async (placeholder: string, option: string) => {
  await userEvent.click(screen.getByRole("button", { name: "Show filters" }));
  await userEvent.click(screen.getByPlaceholderText(placeholder));
  await userEvent.click(await screen.findByRole("option", { name: option }));
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
};

describe("OAuthClientsPage", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ height: 800, width: 1000 });
  });

  it.each([null, ""])(
    "names a client registered with %p as its name",
    async (client_name) => {
      setup({ clients: [createMockOAuthClient({ client_name })] });

      const table = await findLoadedTable();

      expect(within(table).getByText("Unnamed client")).toBeInTheDocument();
    },
  );

  it.each([
    { search: "", emptyLabel: "No active clients" },
    {
      search: "?tab=revoked",
      emptyLabel: "Clients you revoke will appear here.",
    },
  ])("shows the empty state for $search", async ({ search, emptyLabel }) => {
    setup({ clients: [], initialRoute: `${PATHNAME}${search}` });

    const table = await findLoadedTable();

    expect(within(table).getByText(emptyLabel)).toBeInTheDocument();
  });

  it("switches to the Revoked tab, keeping it in the URL", async () => {
    const { router } = setup();

    await findLoadedTable();
    await userEvent.click(screen.getByTestId("oauth-clients-tab-revoked"));

    await waitFor(() => expect(lastListCallUrl()).toContain("status=revoked"));
    // the URL write is debounced, so it lands after the request
    await waitFor(() =>
      expect(router?.location.search).toContain("tab=revoked"),
    );
    expect(
      screen.getByText("Revoked clients are kept on record."),
    ).toBeInTheDocument();
  });

  it("shows the bulk action bar once a row is selected, and clears it again", async () => {
    setup({ clients: [createMockOAuthClient({ client_id: "client-1" })] });

    await selectRow("client-1");

    expect(await screen.findByText("1 client selected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.queryByText("1 client selected")).not.toBeInTheDocument();
  });

  it.each([
    {
      name: "the tab",
      change: () =>
        userEvent.click(screen.getByTestId("oauth-clients-tab-revoked")),
    },
    {
      name: "the page",
      change: () =>
        userEvent.click(screen.getByRole("button", { name: "Next page" })),
    },
    {
      name: "the search",
      change: () =>
        userEvent.type(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), "x"),
    },
    {
      name: "a filter",
      change: () => applyFilter("Any time", "Past day"),
    },
    {
      name: "the sort",
      change: () => clickHeader("Users"),
    },
  ])("clears the selection when $name changes", async ({ change }) => {
    setup({
      clients: [createMockOAuthClient({ client_id: "client-1" })],
      listOverrides: PAGED,
    });

    await selectRow("client-1");
    expect(await screen.findByText("1 client selected")).toBeInTheDocument();

    await change();

    await waitFor(() =>
      expect(screen.queryByText("1 client selected")).not.toBeInTheDocument(),
    );
  });

  it.each([
    {
      action: "a single client",
      trigger: async () => {
        await selectRow("client-1");
        await clickBulkRevoke();
      },
      title: "Revoke this client?",
      message:
        "Claude Code will lose access for everyone who connected it, and will need to be approved again. This can't be undone.",
      body: { ids: ["client-1"] },
    },
    {
      action: "the selected clients",
      trigger: async () => {
        await selectAllRows();
        await clickBulkRevoke();
      },
      title: "Revoke 2 clients?",
      message:
        "Everyone who connected them will lose access, and each client will need to be approved again. This can't be undone.",
      body: { ids: ["client-1", "client-2"] },
    },
    {
      action: "every active client",
      trigger: clickRevokeAll,
      title: "Revoke all OAuth clients?",
      message:
        "Every connected client will lose access and need to be approved again. This can't be undone.",
      body: {},
    },
  ])(
    "confirms before revoking $action, then sends its criteria",
    async ({ trigger, title, message, body }) => {
      setup({
        clients: [
          createMockOAuthClient({
            client_id: "client-1",
            client_name: "Claude Code",
          }),
          createMockOAuthClient({ client_id: "client-2" }),
        ],
      });
      await findLoadedTable();

      await trigger();

      const modal = await screen.findByTestId("confirm-modal");
      expect(within(modal).getByText(title)).toBeInTheDocument();
      expect(within(modal).getByText(message)).toBeInTheDocument();
      expect(lastRevokeBody()).toBeUndefined();

      await confirmRevoke();

      await waitFor(() => expect(lastRevokeBody()).toEqual(body));
    },
  );

  it("reports how many were revoked, clears the selection, and re-requests the list", async () => {
    setup({
      clients: [createMockOAuthClient({ client_id: "client-1" })],
      revokeResponse: createMockRevokeOAuthClientsResponse({ revoked: 1 }),
    });

    await findLoadedTable();
    const listCallsBefore = fetchMock.callHistory.calls(LIST_PATH).length;
    await selectRow("client-1");
    await clickBulkRevoke();
    await confirmRevoke();

    expect(await screen.findByText("Revoked 1 client")).toBeInTheDocument();
    expect(screen.queryByText("1 client selected")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.callHistory.calls(LIST_PATH).length).toBeGreaterThan(
        listCallsBefore,
      ),
    );
  });

  it("warns when a client registered while the revoke was running", async () => {
    setup({
      revokeResponse: createMockRevokeOAuthClientsResponse({
        revoked: 2,
        remaining: 1,
      }),
    });

    await clickRevokeAll();
    await confirmRevoke();

    expect(await screen.findByText("Revoked 2 clients")).toBeInTheDocument();
    expect(
      await screen.findByText("1 new client registered while revoking"),
    ).toBeInTheDocument();
  });

  it("reports a failed revoke", async () => {
    setup({ revokeError: true });

    await clickRevokeAll();
    await confirmRevoke();

    expect(
      await screen.findByText("Could not revoke clients."),
    ).toBeInTheDocument();
  });

  it("pages through the clients, keeping the page in the URL and showing the total", async () => {
    const { router } = setup({ listOverrides: PAGED });

    await findLoadedTable();
    expect(screen.getByTestId("pagination-total")).toHaveTextContent(
      String(PAGED.total),
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

  it("searches by name, client ID or redirect URI from the first page", async () => {
    const { router } = setup({
      listOverrides: PAGED,
      initialRoute: `${PATHNAME}?page=2`,
    });

    await findLoadedTable();
    await userEvent.type(
      screen.getByPlaceholderText(SEARCH_PLACEHOLDER),
      "reporting bot",
    );

    await waitFor(() =>
      expect(lastListCallUrl()).toContain("query=reporting+bot"),
    );
    expect(lastListCallUrl()).toContain("offset=0");
    await waitFor(() =>
      expect(router?.location.search).toContain("query=reporting+bot"),
    );
  });

  it("filters by when a client registered and by who connected it, back on the first page", async () => {
    const { router } = setup({
      listOverrides: PAGED,
      initialRoute: `${PATHNAME}?page=2`,
    });

    await findLoadedTable();
    await userEvent.click(screen.getByRole("button", { name: "Show filters" }));
    await userEvent.click(screen.getByPlaceholderText("Any time"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Past week" }),
    );
    await userEvent.click(screen.getByRole("textbox", { name: "User" }));
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

  it("filters by when a client was last used, back on the first page", async () => {
    const { router } = setup({
      listOverrides: PAGED,
      initialRoute: `${PATHNAME}?page=2`,
    });

    await findLoadedTable();
    await applyFilter("Any time, used or not", "Past hour");

    await waitFor(() =>
      expect(lastListCallUrl()).toContain("last-used-after="),
    );
    expect(lastListCallUrl()).toContain("offset=0");
    await waitFor(() =>
      expect(router?.location.search).toContain("last_used=hour"),
    );
    expect(router?.location.search).not.toContain("page=2");
  });

  it("clears the filters, back on the first page", async () => {
    const { router } = setup({
      listOverrides: PAGED,
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

  it.each([
    { search: "", header: "Client", column: "client_name", direction: "asc" },
    {
      search: "",
      header: "Last used",
      column: "last_used_at",
      direction: "desc",
    },
    {
      search: "?tab=revoked",
      header: "Revoked",
      column: "revoked_at",
      direction: "desc",
    },
  ])(
    "sorts on $header, $direction first",
    async ({ search, header, column, direction }) => {
      setup({ initialRoute: `${PATHNAME}${search}` });

      await findLoadedTable();
      await clickHeader(header);

      await waitFor(() =>
        expect(lastListCallUrl()).toContain(`sort-column=${column}`),
      );
      expect(lastListCallUrl()).toContain(`sort-direction=${direction}`);
    },
  );

  it("sorts on a count header largest first, then smallest, from the first page and keeping the sort in the URL", async () => {
    const { router } = setup({
      listOverrides: PAGED,
      initialRoute: `${PATHNAME}?page=2`,
    });

    await findLoadedTable();
    await clickHeader("Users");

    await waitFor(() =>
      expect(lastListCallUrl()).toContain("sort-column=user_count"),
    );
    expect(lastListCallUrl()).toContain("sort-direction=desc");
    expect(lastListCallUrl()).toContain("offset=0");
    await waitFor(() =>
      expect(router?.location.search).toContain("sort_column=user_count"),
    );
    expect(router?.location.search).not.toContain("page=2");

    await clickHeader("Users");

    await waitFor(() =>
      expect(lastListCallUrl()).toContain("sort-direction=asc"),
    );
  });

  it("offers no sort on the columns the endpoint cannot order by", async () => {
    setup();

    await findLoadedTable();

    expect(getHeader("Redirect URIs")).not.toHaveAttribute("tabindex");
    expect(getHeader("Registered")).toHaveAttribute("tabindex", "0");
  });

  it("offers nothing to revoke all of on the Revoked tab", async () => {
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

  it("shows an error when the clients cannot be loaded", async () => {
    setup({ listError: true });

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(screen.queryByText("No active clients")).not.toBeInTheDocument();
  });

  describe("the client detail sidebar", () => {
    const CLIENT_ID = "client-abc";

    // a list refetch can replace the portalled sidebar, so a held reference would go stale
    const sidebar = () => screen.getByTestId("oauth-client-detail-sidebar");

    const openSidebar = async () => {
      await findLoadedTable();
      await userEvent.click(
        screen.getByTestId(`oauth-client-row-${CLIENT_ID}`),
      );
      await screen.findByTestId("oauth-client-detail-sidebar");
      // a detail-only field, so this waits for the detail to land
      await within(sidebar()).findByText("mb:full");
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

    it("says a client is no longer registered even while the list still has its row, because the server has contradicted it", async () => {
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
});
