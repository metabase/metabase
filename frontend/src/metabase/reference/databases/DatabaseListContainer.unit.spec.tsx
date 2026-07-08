import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDatabase } from "metabase-types/api/mocks";

import DatabaseListContainer from "./DatabaseListContainer";

const database = createMockDatabase({ id: 1, name: "Test Database" });

function setup() {
  setupDatabasesEndpoints([database]);
  return renderWithProviders(
    <Route path="/" component={DatabaseListContainer} />,
    { withRouter: true, initialRoute: "/" },
  );
}

describe("DatabaseListContainer", () => {
  it("fetches databases on mount and renders them", async () => {
    setup();

    expect(await screen.findByText("Test Database")).toBeInTheDocument();
  });
});
