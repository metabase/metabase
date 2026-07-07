import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { BrowseSchemas } from "./BrowseSchemas";

const setup = ({
  databases,
  initialRoute,
}: {
  databases: Database[];
  initialRoute: string;
}) => {
  setupDatabasesEndpoints(databases);
  return renderWithProviders(
    <Route path="/browse/databases/:slug" component={BrowseSchemas} />,
    { withRouter: true, initialRoute },
  );
};

describe("BrowseSchemas name-based permalinks", () => {
  it("renders the database browse page in place, keeping the name url", async () => {
    const { history } = setup({
      databases: [createMockDatabase({ id: 7, name: "Sales" })],
      initialRoute: "/browse/databases/Sales",
    });

    expect(await screen.findByTestId("browse-schemas")).toBeInTheDocument();
    expect(history?.getCurrentLocation().pathname).toBe(
      "/browse/databases/Sales",
    );
  });

  it("resolves to the lowest id when names collide", async () => {
    setup({
      databases: [
        createMockDatabase({ id: 9, name: "Prod" }),
        createMockDatabase({ id: 4, name: "Prod" }),
      ],
      initialRoute: "/browse/databases/Prod",
    });

    expect(await screen.findByTestId("browse-schemas")).toBeInTheDocument();
    // the page shows the lowest-id database's schemas
    expect(
      fetchMock.callHistory.calls("path:/api/database/4/schemas"),
    ).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls("path:/api/database/9/schemas"),
    ).toHaveLength(0);
  });

  it("matches names case-sensitively", async () => {
    setup({
      databases: [createMockDatabase({ id: 7, name: "Sales" })],
      initialRoute: "/browse/databases/sales",
    });

    expect(await screen.findByLabelText("error page")).toBeInTheDocument();
  });

  it("shows a not-found page for an unknown name", async () => {
    setup({
      databases: [createMockDatabase({ id: 7, name: "Sales" })],
      initialRoute: "/browse/databases/Unknown",
    });

    expect(await screen.findByLabelText("error page")).toBeInTheDocument();
  });

  it("shows an error instead of not-found when the databases request fails", async () => {
    fetchMock.get("path:/api/database", 500);
    renderWithProviders(
      <Route path="/browse/databases/:slug" component={BrowseSchemas} />,
      { withRouter: true, initialRoute: "/browse/databases/Sales" },
    );

    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(screen.queryByLabelText("error page")).not.toBeInTheDocument();
  });
});
