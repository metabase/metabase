import { screen, within } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setupEnterprise as setup } from "./setup";

const setupEnterprise = (opts: SetupOpts) => {
  return setup({
    ...opts,
    settings: createMockSettings({
      "token-features": createMockTokenFeatures({
        content_verification: true,
        cache_granular_controls: true,
        serialization: true,
        audit_app: true,
      }),
    }),
  });
};

describe("DashboardInfoSidebar (EE with token)", () => {
  describe("entity id display", () => {
    it("should show entity ids only with serialization feature", async () => {
      const dashboard = createMockDashboard({
        entity_id: "jenny8675309" as Dashboard["entity_id"],
      });
      await setupEnterprise({ dashboard });

      expect(screen.getByText("Entity ID")).toBeInTheDocument();
      expect(screen.getByText("jenny8675309")).toBeInTheDocument();
    });
  });
  it("should show collection without icon when collection is not official", async () => {
    await setup(
      {
        dashboard: createMockDashboard({
          collection: createMockCollection({
            name: "My little collection",
          }),
        }),
      },
      { official_collections: true },
    );

    const collectionSection = await screen.findByLabelText("Saved in");
    expect(
      within(collectionSection).getByText("My little collection"),
    ).toBeInTheDocument();
    expect(
      within(collectionSection).queryByTestId("official-collection-marker"),
    ).not.toBeInTheDocument();
  });
  it("should show collection with icon when collection is official", async () => {
    await setup(
      {
        dashboard: createMockDashboard({
          collection: createMockCollection({
            name: "My little collection ",
            authority_level: "official",
          }),
        }),
      },
      { official_collections: true },
    );

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
