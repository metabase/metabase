import fetchMock from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import FieldDetailContainer from "./FieldDetailContainer";

const TOTAL = createMockField({
  id: 100,
  name: "TOTAL",
  display_name: "Total",
  table_id: 10,
});

const TABLE = createMockTable({ id: 10, db_id: 1, fields: [TOTAL] });

const DATABASE = createMockDatabase({ id: 1, tables: [TABLE] });

function setup() {
  setupDatabaseEndpoints(DATABASE);
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);

  return renderWithProviders(
    <Route
      path="/reference/databases/:databaseId/tables/:tableId/fields/:fieldId"
      element={<FieldDetailContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/databases/${DATABASE.id}/tables/${TABLE.id}/fields/${TOTAL.id}`,
    },
  );
}

describe("FieldDetailContainer", () => {
  // `FieldDetail` reads `metadata` but doesn't select it, so the page blanks if
  // the container stops passing it down.
  it("renders the field named by the route params", async () => {
    setup();

    expect(await screen.findAllByText("Total")).not.toHaveLength(0);
  });

  it("offers the x-ray link from the sidebar", async () => {
    setup();

    expect(await screen.findByText("X-ray this field")).toBeInTheDocument();
  });
});
