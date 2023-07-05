import userEvent from "@testing-library/user-event";
import { screen } from "__support__/ui";

import { setup } from "./testSetup";

describe("SharingSidebar Premium Features", () => {
  const tokenFeatures = {
    advanced_config: true,
  };

  describe("Email Subscription sidebar", () => {
    it("should only show advanced filtering options with the advanced_config flag", async () => {
      setup({ email: true, tokenFeatures });

      userEvent.click(await screen.findByText("Email it"));

      await screen.findByText("Email this dashboard");

      expect(
        screen.queryByText(
          /If a dashboard filter has a default value, it’ll be applied when your subscription is sent./i,
        ),
      ).not.toBeInTheDocument();

      expect(
        screen.getByText(/set filter values for when this gets sent/i),
      ).toBeVisible();
    });
  });

  describe("Slack Subscription sidebar", () => {
    it("should only show advanced filtering options with the advanced_config flag", async () => {
      setup({ slack: true, tokenFeatures });

      userEvent.click(await screen.findByText("Send it to Slack"));

      await screen.findByText("Send this dashboard to Slack");

      expect(
        screen.queryByText(
          /If a dashboard filter has a default value, it’ll be applied when your subscription is sent./i,
        ),
      ).not.toBeInTheDocument();

      expect(
        screen.getByText(/set filter values for when this gets sent/i),
      ).toBeVisible();
    });
  });
});
