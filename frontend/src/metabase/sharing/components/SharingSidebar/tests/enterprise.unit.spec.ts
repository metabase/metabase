import userEvent from "@testing-library/user-event";
import { screen } from "__support__/ui";

import { setup, hasBasicFilterOptions } from "./setup";

describe("SharingSidebar Enterprise Bundle", () => {
  describe("Email Subscription sidebar", () => {
    it("should only show advanced filtering options with the advanced_config flag", async () => {
      setup({ email: true, hasEnterprisePlugins: true });

      userEvent.click(await screen.findByText("Email it"));

      await screen.findByText("Email this dashboard");

      expect(hasBasicFilterOptions(screen)).toBe(true);
    });
  });

  describe("Slack Subscription sidebar", () => {
    it("should only show advanced filtering options with the advanced_config flag", async () => {
      setup({ slack: true, hasEnterprisePlugins: true });

      userEvent.click(await screen.findByText("Send it to Slack"));

      await screen.findByText("Send this dashboard to Slack");

      expect(hasBasicFilterOptions(screen)).toBe(true);
    });
  });
});
