import { screen } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import {
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

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
    enterprisePlugins: ["collections"],
  });
};

describe("DashboardInfoSidebar > enterprise", () => {
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
});
