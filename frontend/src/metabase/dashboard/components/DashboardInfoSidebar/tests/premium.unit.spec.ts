import { screen, within } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup as baseSetup } from "./setup";

const setup = (opts: SetupOpts) => {
  return baseSetup({
    ...opts,
    withFeatures: [
      "content_verification",
      "cache_granular_controls",
      "serialization",
      "audit_app",
      "official_collections",
    ],
  });
};

describe("DashboardInfoSidebar (EE with tokens)", () => {
  describe("entity id display", () => {
    it("should show entity ids only with serialization feature", async () => {
      const dashboard = createMockDashboard({
        entity_id: "jenny8675309" as Dashboard["entity_id"],
      });
      await setup({ dashboard });

      expect(screen.getByText("Entity ID")).toBeInTheDocument();
      expect(screen.getByText("jenny8675309")).toBeInTheDocument();
    });
  });
  it("should show collection without icon when collection is not official", async () => {
    await setup({
      dashboard: createMockDashboard({
        collection: createMockCollection({
          name: "My little collection",
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
  it("should show collection with icon when collection is official", async () => {
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
      await within(collectionSection).findByTestId(
        "official-collection-marker",
      ),
    ).toBeInTheDocument();
  });
});
