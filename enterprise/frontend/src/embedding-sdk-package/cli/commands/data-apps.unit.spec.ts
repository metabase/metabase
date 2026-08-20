import { Command } from "commander";

import { syncResourcesAction } from "../actions/sync-resources";

import { addDataAppsCommands } from "./data-apps";

jest.mock("../actions/sync-resources", () => ({
  syncResourcesAction: jest.fn(),
}));

describe("data app commands", () => {
  it("runs resource synchronization for the requested app root", async () => {
    const program = new Command();
    addDataAppsCommands(program);

    await program.parseAsync([
      "node",
      "cli",
      "data-apps",
      "sync-resources",
      "--app-root",
      "data_apps/orders",
    ]);

    expect(syncResourcesAction).toHaveBeenCalledWith("data_apps/orders");
  });

  it("runs resource synchronization from the current directory by default", async () => {
    const program = new Command();
    addDataAppsCommands(program);

    await program.parseAsync(["node", "cli", "data-apps", "sync-resources"]);

    expect(syncResourcesAction).toHaveBeenCalledWith(process.cwd());
  });
});
