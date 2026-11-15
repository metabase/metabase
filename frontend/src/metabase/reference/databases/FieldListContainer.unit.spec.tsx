import fetchMock from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import FieldListContainer from "./FieldListContainer";

const TOTAL = createMockField({
  id: 100,
  name: "TOTAL",
  display_name: "Total",
  table_id: 10,
});

const TABLE = createMockTable({
  id: 10,
  db_id: 1,
  display_name: "Orders",
  fields: [TOTAL],
});

const DATABASE = createMockDatabase({ id: 1, tables: [TABLE] });

function setup() {
  setupDatabaseEndpoints(DATABASE);
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);

  return renderWithProviders(
    <Route
      path="/reference/databases/:databaseId/tables/:tableId/fields"
      element={<FieldListContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/databases/${DATABASE.id}/tables/${TABLE.id}/fields`,
    },
  );
}

describe("FieldListContainer", () => {
  it("lists the fields of the table named by the route params", async () => {
    setup();

    expect(await screen.findAllByText("Fields in Orders")).not.toHaveLength(0);
    expect(await screen.findByText("Total")).toBeInTheDocument();
  });
});
