import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { setup, hasBasicFilterOptions } from "./setup";

describe("SharingSidebar Enterprise Bundle", () => {
  describe("Email Subscription sidebar", () => {
    it("should not show advanced filtering options without the feature flag", async () => {
      setup({ isAdmin: true, email: true, hasEnterprisePlugins: true });

      await userEvent.click(await screen.findByText("Email it"));

      await screen.findByText("Email this dashboard");

      expect(hasBasicFilterOptions(screen)).toBe(true);
    });
  });

  describe("Slack Subscription sidebar", () => {
    it("should not show advanced filtering options without the feature flag", async () => {
      setup({ isAdmin: true, slack: true, hasEnterprisePlugins: true });

      await userEvent.click(await screen.findByText("Send it to Slack"));

      await screen.findByText("Send this dashboard to Slack");

      expect(hasBasicFilterOptions(screen)).toBe(true);
    });
  });
});
