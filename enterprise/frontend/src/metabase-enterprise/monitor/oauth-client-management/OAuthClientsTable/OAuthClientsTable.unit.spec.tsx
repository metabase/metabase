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
    const client = createMockOAuthClient();
    setup({ clients: [client] });

    expect(await getRow(client)).toHaveTextContent(client.client_id);
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
    // nothing on this tab has anything left to revoke
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("badges the client the caller's own token came from, and doesn't let it be selected", async () => {
    const current = createMockOAuthClient({
      client_id: "current",
      current: true,
    });
    const other = createMockOAuthClient({ client_id: "other" });
    setup({ clients: [current, other] });

    expect(
      within(await getRow(current)).getByText("This client"),
    ).toBeInTheDocument();
    expect(within(await getRow(current)).getByRole("checkbox")).toBeDisabled();
    expect(
      within(await getRow(other)).queryByText("This client"),
    ).not.toBeInTheDocument();
    expect(within(await getRow(other)).getByRole("checkbox")).toBeEnabled();
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
