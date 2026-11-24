import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import {
  createMockDatabase,
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { TableBrowser } from "./TableBrowser";

const { trackSimpleEvent } = jest.requireMock<{
  trackSimpleEvent: jest.Mock;
}>("metabase/analytics");

const EDITABLE_TABLE_ID = 123;
const EDITABLE_DB_ID = 1;

async function setupTableEditing({
  isAdmin = true,
  isTableEditingEnabled = true,
}: { isAdmin?: boolean; isTableEditingEnabled?: boolean } = {}) {
  const table = createMockTable({
    id: EDITABLE_TABLE_ID,
    name: "foo",
    display_name: "foo",
    initial_sync_status: "complete",
    is_writable: true,
  });
  const database = createMockDatabase({
    id: EDITABLE_DB_ID,
    name: "Writable DB",
    tables: [table],
    settings: { "database-enable-table-editing": isTableEditingEnabled },
  });
  fetchMock.get(`path:/api/database/${database.id}`, database);
  fetchMock.get(`path:/api/database/${database.id}/schema/public`, [table]);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        table_data_editing: true,
      }),
    }),
  });
  setupEnterpriseOnlyPlugin("table-editing");

  renderWithProviders(
    <TableBrowser dbId={EDITABLE_DB_ID} schemaName="public" />,
    { storeInitialState: state, withRouter: true },
  );

  expect(await screen.findByText("foo")).toBeInTheDocument();
  // The database name in the breadcrumbs comes from the same request that
  // decides whether the edit action is offered.
  expect(await screen.findByText("Writable DB")).toBeInTheDocument();
}

// The test asserts that the browser polls while a sync is in progress, not how
// long it waits between polls.
jest.mock("metabase/browse/constants", () => ({
  ...jest.requireActual("metabase/browse/constants"),
  RELOAD_INTERVAL: 50,
}));

describe("TableBrowser", () => {
  beforeEach(() => {
    // The database breadcrumb reads the database list that the app fetches on launch.
    fetchMock.get("path:/api/database", { data: [], total: 0 });
  });

  it("should poll until tables have completed initial sync", async () => {
    // initially, initial_sync_status='incomplete'
    fetchMock.get(
      "path:/api/database/1/schema/public",
      [{ id: 123, name: "foo", initial_sync_status: "incomplete" }],
      { name: "database-get-schema" },
    );
    fetchMock.get("path:/api/database/1", [
      { id: 123, name: "bar", initial_sync_status: "complete" },
    ]);
    renderWithProviders(<TableBrowser dbId={1} schemaName="public" />);
    await waitFor(() => {
      expect(screen.getByText("foo")).toBeInTheDocument();
    });
    // check only one call has been made
    const calls = fetchMock.callHistory.calls(
      "path:/api/database/1/schema/public",
    );
    expect(calls.length).toBe(1);
    // check the loading spinner is present
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    // change the table to have initial_sync_status='complete'
    fetchMock.modifyRoute("database-get-schema", {
      response: [{ id: 123, name: "foo", initial_sync_status: "complete" }],
    });
    await waitFor(
      () => {
        expect(
          fetchMock.callHistory.calls("path:/api/database/1/schema/public")
            .length,
        ).toBe(2);
      },
      { timeout: 3000 },
    );
    await waitForLoaderToBeRemoved();
  });

  it("loads database metadata for schema-less databases (#73928)", async () => {
    const table = createMockTable({
      id: 123,
      name: "foo",
      display_name: "foo",
      initial_sync_status: "complete",
    });
    const database = createMockDatabase({
      id: 1,
      tables: [table],
    });
    fetchMock.get(`path:/api/database/${database.id}`, database);
    fetchMock.get(`path:/api/database/${database.id}/metadata`, database);
    fetchMock.get(`path:/api/database/${database.id}/schema/`, [table]);

    renderWithProviders(<TableBrowser dbId={1} schemaName="" />);

    await waitFor(() => {
      expect(screen.getByText("foo")).toBeInTheDocument();
    });

    const metadataCalls = fetchMock.callHistory.calls(
      "path:/api/database/1/metadata",
    );
    expect(metadataCalls).toHaveLength(1);
    expect(metadataCalls[0].url).toContain("skip_fields=true");
    expect(
      fetchMock.callHistory.calls("path:/api/database/1/schema/"),
    ).toHaveLength(0);
  });

  it("offers the edit action when the database allows table editing", async () => {
    const table = createMockTable({
      id: 123,
      name: "foo",
      display_name: "foo",
      initial_sync_status: "complete",
      is_writable: true,
    });
    const database = createMockDatabase({
      id: 1,
      tables: [table],
      settings: { "database-enable-table-editing": true },
    });
    fetchMock.get(`path:/api/database/${database.id}`, database);
    fetchMock.get(`path:/api/database/${database.id}/schema/public`, [table]);

    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings({
        "token-features": createMockTokenFeatures({
          table_data_editing: true,
        }),
      }),
    });
    setupEnterpriseOnlyPlugin("table-editing");

    renderWithProviders(<TableBrowser dbId={1} schemaName="public" />, {
      storeInitialState: state,
    });

    expect(await screen.findByText("foo")).toBeInTheDocument();
    expect(await screen.findByTestId("edit-table-icon")).toBeInTheDocument();
  });

  it("links the edit action to table edit mode and tracks the click", async () => {
    await setupTableEditing();

    const editIcon = screen.getByTestId("edit-table-icon");
    expect(editIcon).toHaveAttribute(
      "href",
      `/browse/databases/${EDITABLE_DB_ID}/tables/${EDITABLE_TABLE_ID}/edit`,
    );

    await userEvent.click(editIcon);

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "edit_data_button_clicked",
      target_id: EDITABLE_TABLE_ID,
      triggered_from: "table-browser",
    });
  });

  it("does not offer the edit action to non-admins", async () => {
    await setupTableEditing({ isAdmin: false });

    expect(screen.queryByTestId("edit-table-icon")).not.toBeInTheDocument();
  });

  it("does not offer the edit action when the database has table editing turned off", async () => {
    await setupTableEditing({ isTableEditingEnabled: false });

    expect(screen.queryByTestId("edit-table-icon")).not.toBeInTheDocument();
  });
});
