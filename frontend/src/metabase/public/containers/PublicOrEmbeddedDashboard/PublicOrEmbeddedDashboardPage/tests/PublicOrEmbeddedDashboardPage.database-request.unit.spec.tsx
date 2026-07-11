import fetchMock from "fetch-mock";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("PublicOrEmbeddedDashboardPage > database requests", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("should not call `GET /api/database` in a static embedding (metabase#63310)", async () => {
    // `setup` resolves only after the dashboard grid has rendered, so any
    // database request the grid triggers on mount has already fired by now.
    await setup({ dashboardTitle: "Orders in a dashboard" });

    expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();

    const listDatabaseCalls = fetchMock.callHistory.calls("path:/api/database", {
      method: "GET",
    });
    expect(listDatabaseCalls).toHaveLength(0);
  });
});
