import path from "node:path";

import { getQuerySyncCredentials } from "../../data-app-query-sync/env";
import { syncQueries } from "../../data-app-query-sync/sync";

import { syncQueriesAction } from "./sync-queries";

jest.mock("../../data-app-query-sync/env", () => ({
  getQuerySyncCredentials: jest.fn(),
}));
jest.mock("../../data-app-query-sync/sync", () => ({ syncQueries: jest.fn() }));

describe("syncQueriesAction", () => {
  it("resolves the app root and loads its credentials", async () => {
    jest.mocked(getQuerySyncCredentials).mockReturnValue({
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
    });

    await syncQueriesAction("data_apps/orders");

    const appRoot = path.resolve("data_apps/orders");
    expect(getQuerySyncCredentials).toHaveBeenCalledWith(appRoot);
    expect(syncQueries).toHaveBeenCalledWith({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
    });
  });
});
