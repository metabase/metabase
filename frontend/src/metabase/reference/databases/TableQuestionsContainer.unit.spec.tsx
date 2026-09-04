import fetchMock from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import TableQuestionsContainer from "./TableQuestionsContainer";

const TABLE = createMockTable({ id: 10, db_id: 1, display_name: "Orders" });

const DATABASE = createMockDatabase({ id: 1, tables: [TABLE] });

function setup() {
  setupDatabaseEndpoints(DATABASE);
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);
  fetchMock.get("path:/api/card", []);

  return renderWithProviders(
    <Route
      path="/reference/databases/:databaseId/tables/:tableId/questions"
      element={<TableQuestionsContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/databases/${DATABASE.id}/tables/${TABLE.id}/questions`,
    },
  );
}

describe("TableQuestionsContainer", () => {
  it("renders the questions view for the table named by the route params", async () => {
    setup();

    expect(
      await screen.findAllByText("Questions about Orders"),
    ).not.toHaveLength(0);
  });
});
