import { Command } from "commander";

import { repositorySchemaAction } from "../actions/repository-schema";
import { syncResourcesAction } from "../actions/sync-resources";

import { addDataAppsCommands } from "./data-apps";

jest.mock("../actions/sync-resources", () => ({
  syncResourcesAction: jest.fn(),
}));
jest.mock("../actions/repository-schema", () => ({
  repositorySchemaAction: jest.fn(),
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

  it("passes repository scope and refresh options to schema generation", async () => {
    const program = new Command();
    addDataAppsCommands(program);

    await program.parseAsync([
      "node",
      "cli",
      "data-apps",
      "generate-schema",
      "--app-root",
      "data_apps/orders",
      "--library-collections",
      "first,second",
      "--force-refresh",
      "--max-age-minutes",
      "30",
    ]);

    expect(repositorySchemaAction).toHaveBeenCalledWith(
      {
        appRoot: "data_apps/orders",
        libraryCollections: ["first", "second"],
        forceRefresh: true,
        maxAgeMinutes: 30,
      },
      false,
    );
  });
});
