import userEvent from "@testing-library/user-event";

import { setupDependencyGraphEndpoint } from "__support__/server-mocks";
import { screen } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { createMockTable } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("TableSection (dependencies)", () => {
  it("should track a dependency graph click with the table id", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    const table = createMockTable({ id: 42 });
    setupDependencyGraphEndpoint({ nodes: [], edges: [] });
    setup({
      table,
      isAdmin: true,
      enterprisePlugins: ["dependencies"],
      tokenFeatures: { dependencies: true },
    });

    await userEvent.click(
      screen.getByRole("link", { name: "Dependency graph" }),
    );

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "dependency_entity_selected",
      triggered_from: "data-structure",
      event_detail: "table",
      target_id: 42,
    });
  });
});
