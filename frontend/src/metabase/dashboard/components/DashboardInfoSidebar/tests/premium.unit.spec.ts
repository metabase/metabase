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
        // Unjustified type cast. FIXME
        entity_id: "jenny8675309" as Dashboard["entity_id"],
      });
      await setupEnterprise({ dashboard });

      expect(screen.getByText("Entity ID")).toBeInTheDocument();
      expect(screen.getByText("jenny8675309")).toBeInTheDocument();
    });
  });

  describe("Insights link", () => {
    const setupWithAuditApp = (opts: SetupOpts) =>
      setup({
        ...opts,
        settings: createMockSettings({
          "token-features": createMockTokenFeatures({ audit_app: true }),
        }),
        enterprisePlugins: ["audit_app", "collections"],
      });

    it("should show an Insights link to users who can see usage analytics", async () => {
      await setupWithAuditApp({ dashboard: createMockDashboard({ id: 2 }) });

      expect(
        await screen.findByRole("tab", { name: "Overview" }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole("link", { name: /Insights/i }),
      ).toHaveAttribute("href", "/dashboard/201?dashboard_id=2");
    });

    it("should not show an Insights link to users without access to usage analytics", async () => {
      await setupWithAuditApp({
        dashboard: createMockDashboard({ id: 2 }),
        auditInfo: {},
      });

      expect(
        await screen.findByRole("tab", { name: "Overview" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /Insights/i }),
      ).not.toBeInTheDocument();
    });
  });
});
