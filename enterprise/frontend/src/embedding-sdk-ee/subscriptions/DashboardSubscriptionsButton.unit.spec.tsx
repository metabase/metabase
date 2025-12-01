import { screen, waitFor } from "@testing-library/react";

import {
  findRequests,
  setupNotificationChannelsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";

import { DashboardSubscriptionsButton } from "./DashboardSubscriptionsButton";

interface SetupOpts {
  emailConfigured?: boolean;
}
const setup = (opts: SetupOpts = {}) => {
  setupNotificationChannelsEndpoints({
    email: {
      configured: opts.emailConfigured,
    },
  });
  renderWithProviders(<DashboardSubscriptionsButton />);
};

describe("DashboardSubscriptionsButton", () => {
  it("should render the subscriptions button when email is configured", async () => {
    setup({ emailConfigured: true });

    expect(
      await screen.findByRole("button", { name: "Subscriptions" }),
    ).toBeInTheDocument();
    const gets = await findRequests("GET");
    expect(gets).toHaveLength(1);
  });

  it("should not render the subscriptions button when email is not configured", async () => {
    setup({ emailConfigured: false });
    // Ensure the API finishes loading, otherwise, the assertion below will always pass because the API hasn't returned yet
    await waitFor(async () => {
      const gets = await findRequests("GET");
      expect(gets).toHaveLength(1);
    });
    expect(
      screen.queryByRole("button", { name: "Subscriptions" }),
    ).not.toBeInTheDocument();
  });
});
