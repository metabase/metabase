import fetchMock from "fetch-mock";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDatabase } from "metabase-types/api/mocks";

import DatabaseDetailContainer from "./DatabaseDetailContainer";

const DATABASE = createMockDatabase({ id: 1, name: "Test Database" });

function setup() {
  setupDatabaseEndpoints(DATABASE);
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);

  return renderWithProviders(
    <Route
      path="/reference/databases/:databaseId"
      element={<DatabaseDetailContainer />}
    />,
    {
      withRouter: true,
      initialRoute: `/reference/databases/${DATABASE.id}`,
    },
  );
}

describe("DatabaseDetailContainer", () => {
  it("renders the detail view for the database named by the route param", async () => {
    setup();

    expect(await screen.findAllByText("Test Database")).not.toHaveLength(0);
  });
});
