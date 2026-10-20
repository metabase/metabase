import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type { OAuthClient } from "metabase-types/api";
import {
  createMockOAuthClient,
  createMockOAuthClientRevoker,
} from "metabase-types/api/mocks";

import { OAuthClientsTable } from "./OAuthClientsTable";

type SetupOpts = {
  clients: OAuthClient[] | undefined;
  isRevokedTab?: boolean;
};

const setup = ({ clients, isRevokedTab = false }: SetupOpts) => {
  mockGetBoundingClientRect({ height: 800, width: 1000 });

  renderWithProviders(
    <OAuthClientsTable
      clients={clients}
      error={undefined}
      isFetching={false}
      isRevokedTab={isRevokedTab}
      page={0}
      rowSelection={{}}
      selectedClientId={undefined}
      sorting={[{ id: "created_at", desc: true }]}
      emptyLabel="No clients"
      onSortingChange={jest.fn()}
      onRowSelectionChange={jest.fn()}
      onRowClick={jest.fn()}
    />,
  );
};

const getRow = (client: OAuthClient) =>
  screen.findByTestId(`oauth-client-row-${client.client_id}`);

const getColumnHeaders = () =>
  screen
    .getAllByRole("columnheader")
    .map((header) => header.textContent)
    .filter(Boolean);

describe("OAuthClientsTable", () => {
  it("shows the active tab's columns, and the client id under each name", async () => {
    const client = createMockOAuthClient({
      redirect_uris: ["https://claude.ai/cb"],
      user_count: 3,
      live_tokens: 5,
      last_used_at: "2026-09-28T08:30:00Z",
    });
    setup({ clients: [client] });

    const row = await getRow(client);
    expect(row).toHaveTextContent(client.client_id);
    expect(within(row).getByText("https://claude.ai/cb")).toBeInTheDocument();
    expect(within(row).getByText("3")).toBeInTheDocument();
    expect(within(row).getByText("5")).toBeInTheDocument();
    expect(row).toHaveTextContent(/September 28, 2026/);
    expect(getColumnHeaders()).toEqual([
      "Client",
      "Redirect URIs",
      "Users",
      "Live tokens",
      "Last used",
      "Registered",
    ]);
  });

  it("shows who revoked each client and when on the revoked tab", async () => {
    const revoked = createMockOAuthClient({
      client_id: "revoked",
      status: "revoked",
      revoked_at: "2026-09-16T12:00:00Z",
      revoked_by: createMockOAuthClientRevoker({ common_name: "Ann Admin" }),
    });
    // the admin who revoked it has since been deleted, so there is no one left to name
    const orphaned = createMockOAuthClient({
      client_id: "orphaned",
      status: "revoked",
      revoked_at: "2026-09-17T12:00:00Z",
      revoked_by: null,
    });
    setup({ clients: [revoked, orphaned], isRevokedTab: true });

    expect(await getRow(revoked)).toHaveTextContent("Ann Admin");
    expect(getColumnHeaders()).toEqual([
      "Client",
      "Redirect URIs",
      "Registered",
      "Revoked",
      "Revoked by",
    ]);
    expect(
      within(await getRow(orphaned)).getByText(EMPTY_CELL_PLACEHOLDER),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("says so for a client that has never presented a token", async () => {
    const used = createMockOAuthClient({ client_id: "used" });
    const unused = createMockOAuthClient({
      client_id: "unused",
      last_used_at: null,
    });
    setup({ clients: [used, unused] });

    expect(
      within(await getRow(unused)).getByText("Never used"),
    ).toBeInTheDocument();
    expect(
      within(await getRow(used)).queryByText("Never used"),
    ).not.toBeInTheDocument();
  });

  it("shows a skeleton until the first page of clients arrives", () => {
    setup({ clients: undefined });

    expect(screen.queryAllByRole("row")).toHaveLength(0);
    expect(screen.queryByText("No clients")).not.toBeInTheDocument();
  });
});
