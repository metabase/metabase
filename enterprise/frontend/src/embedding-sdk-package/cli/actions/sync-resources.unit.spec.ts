import path from "node:path";

import { getResourceSyncCredentials } from "../../data-app-query-sync/env";
import { syncResources } from "../../data-app-query-sync/sync";

import { syncResourcesAction } from "./sync-resources";

jest.mock("../../data-app-query-sync/env", () => ({
  getResourceSyncCredentials: jest.fn(),
}));
jest.mock("../../data-app-query-sync/sync", () => ({
  syncResources: jest.fn(),
}));

describe("syncResourcesAction", () => {
  it("resolves the app root and loads its credentials", async () => {
    jest.mocked(getResourceSyncCredentials).mockReturnValue({
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
    });

    await syncResourcesAction("data_apps/orders");

    const appRoot = path.resolve("data_apps/orders");
    expect(getResourceSyncCredentials).toHaveBeenCalledWith(appRoot);
    expect(syncResources).toHaveBeenCalledWith({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
    });
  });

  it("uses the current directory by default", async () => {
    jest.mocked(getResourceSyncCredentials).mockReturnValue({
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
    });

    await syncResourcesAction();

    const appRoot = path.resolve(process.cwd());
    expect(getResourceSyncCredentials).toHaveBeenCalledWith(appRoot);
    expect(syncResources).toHaveBeenCalledWith({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
    });
  });
});
