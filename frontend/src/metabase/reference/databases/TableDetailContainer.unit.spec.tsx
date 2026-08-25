import fetchMock from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

const TABLE = createMockTable({ id: 10, db_id: 1, display_name: "Orders" });

const DATABASE = createMockDatabase({ id: 1, tables: [TABLE] });

import TableDetailContainer from "./TableDetailContainer";

function setup() {
  setupDatabaseEndpoints(DATABASE);
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);

  return renderWithProviders(
    <Route
      path="/reference/databases/:databaseId/tables/:tableId"
      element={<TableDetailContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/databases/${DATABASE.id}/tables/${TABLE.id}`,
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
});
