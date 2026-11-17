import fetchMock from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { Table } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import TableDetailContainer from "./TableDetailContainer";

const TABLE = createMockTable({ id: 10, db_id: 1, display_name: "Orders" });

interface SetupOpts {
  table?: Table;
}

function setup({ table = TABLE }: SetupOpts = {}) {
  const DATABASE = createMockDatabase({ id: 1, tables: [table] });
  setupDatabaseEndpoints(DATABASE);
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);

  return renderWithProviders(
    <Route
      path="/reference/databases/:databaseId/tables/:tableId"
      element={<TableDetailContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/databases/${DATABASE.id}/tables/${table.id}`,
    },
  );
}

describe("TableDetailContainer", () => {
  it("renders the detail view for the table named by the route params", async () => {
    setup();

    expect(await screen.findAllByText("Orders")).not.toHaveLength(0);
    expect(
      await screen.findByText("Actual name in database"),
    ).toBeInTheDocument();
  });

  it("shows the description of the table", async () => {
    setup({ table: { ...TABLE, description: "New description" } });

    expect(await screen.findByText("New description")).toBeInTheDocument();
    expect(screen.queryByText("No description yet")).not.toBeInTheDocument();
  });

  it("shows a placeholder when the table description is cleared", async () => {
    setup({ table: { ...TABLE, description: "" } });

    expect(await screen.findByText("No description yet")).toBeInTheDocument();
  });
});
