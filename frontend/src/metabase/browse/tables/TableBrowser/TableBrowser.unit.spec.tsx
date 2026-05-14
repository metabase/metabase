import fetchMock from "fetch-mock";

import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { TableBrowser } from "./TableBrowser";

describe("TableBrowser", () => {
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

    expect(
      fetchMock.callHistory.calls("path:/api/database/1/metadata"),
    ).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls("path:/api/database/1/schema/"),
    ).toHaveLength(0);
  });
});
