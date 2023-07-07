import userEvent from "@testing-library/user-event";
import { screen } from "__support__/ui";

import { setup, hasAdvancedFilterOptions } from "./setup";

describe("SharingSidebar Premium Features (legacy token)", () => {
  const legacyTokenFeatures = {
    advanced_config_legacy: true,
  };

  describe("Email Subscription sidebar", () => {
    it("should show advanced filtering options with the correct feature flag", async () => {
      setup({
        email: true,
        tokenFeatures: legacyTokenFeatures,
        hasEnterprisePlugins: true,
      });

      userEvent.click(await screen.findByText("Email it"));

      await screen.findByText("Email this dashboard");

      expect(hasAdvancedFilterOptions(screen)).toBe(true);
    });
  });

  describe("Slack Subscription sidebar", () => {
    it("should show advanced filtering options with the correct feature flag", async () => {
      setup({
        slack: true,
        tokenFeatures: legacyTokenFeatures,
        hasEnterprisePlugins: true,
      });

      userEvent.click(await screen.findByText("Send it to Slack"));

      await screen.findByText("Send this dashboard to Slack");

      expect(hasAdvancedFilterOptions(screen)).toBe(true);
    });
  });
});
