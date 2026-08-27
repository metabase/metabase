import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import TableListContainer from "./TableListContainer";

const ORDERS = createMockTable({ id: 1, db_id: 1, display_name: "Orders" });
const PEOPLE = createMockTable({ id: 2, db_id: 1, display_name: "People" });

const DATABASE = createMockDatabase({
  id: 1,
  name: "Test Database",
  tables: [ORDERS, PEOPLE],
});

function setup({ databaseId = DATABASE.id } = {}) {
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);

  return renderWithProviders(
    <Route
      path="/reference/databases/:databaseId/tables"
      element={<TableListContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/databases/${databaseId}/tables`,
    },
  );
}

describe("TableListContainer", () => {
  it("fetches metadata for the database in the route and lists its tables", async () => {
    setup();

    expect(await screen.findByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
  });

  it("resolves the database from the route param, not from a prop", async () => {
    setup();

    // The name only reaches the header if `useParams` fed `getDatabase`.
    expect(
      await screen.findAllByText("Tables in Test Database"),
    ).not.toHaveLength(0);
  });
});
