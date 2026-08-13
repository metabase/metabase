import { Command } from "commander";

import { syncQueriesAction } from "../actions/sync-queries";

import { addDataAppsCommands } from "./data-apps";

jest.mock("../actions/sync-queries", () => ({
  syncQueriesAction: jest.fn(),
}));

describe("data app commands", () => {
  it("runs query synchronization for the requested app root", async () => {
    const program = new Command();
    addDataAppsCommands(program);

    await program.parseAsync([
      "node",
      "cli",
      "data-apps",
      "sync-queries",
      "--app-root",
      "data_apps/orders",
    ]);

    expect(syncQueriesAction).toHaveBeenCalledWith("data_apps/orders");
  });
});
