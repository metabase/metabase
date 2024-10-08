import { screen, within } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { type SetupOpts, setup as baseSetup } from "./setup";
const setup = (opts: SetupOpts) => {
  return baseSetup({
    ...opts,
    shouldSetupEnterprisePlugins: true,
  });
};

describe("DashboardInfoSidebar (EE without token)", () => {
  it("should show collection without icon even if collection is official", async () => {
    await setup({
      dashboard: createMockDashboard({
        collection: createMockCollection({
          name: "My little collection ",
          authority_level: "official",
        }),
      }),
    });

    const collectionSection = await screen.findByLabelText("Saved in");
    expect(
      within(collectionSection).getByText("My little collection"),
    ).toBeInTheDocument();
    expect(
      within(collectionSection).queryByTestId("official-collection-marker"),
    ).not.toBeInTheDocument();
  });
  describe("entity id display", () => {
    it("should not show entity ids without serialization feature", async () => {
      const dashboard = createMockDashboard({
        entity_id: "jenny8675309" as Dashboard["entity_id"],
      });
      await setup({ dashboard });

      expect(screen.queryByText("Entity ID")).not.toBeInTheDocument();
      expect(screen.queryByText("jenny8675309")).not.toBeInTheDocument();
    });
  });
});
