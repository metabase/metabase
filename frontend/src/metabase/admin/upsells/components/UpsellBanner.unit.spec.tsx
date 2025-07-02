import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { UpsellBanner } from "./UpsellBanner";

function setup({
  dismissible = false,
  userHasSeen = false,
  campaign = "test-campaign",
  title = "Test title",
}: {
  dismissible?: boolean;
  userHasSeen?: boolean;
  campaign?: string;
  title?: string;
} = {}) {
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: `upsell-${campaign}`,
    value: userHasSeen,
  });

  return renderWithProviders(
    <UpsellBanner
      campaign={campaign}
      title={title}
      buttonText="Test button text"
      source="test-source"
      internalLink="test-internal-link"
      dismissible={dismissible}
    >
      Banner content
    </UpsellBanner>,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );
}

describe("UpsellsBanner > Upsell Wrapper Dismissible", () => {
  it("should show a component when dismissible is false", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText("Test title")).toBeInTheDocument();
    });
  });

  it("should show a component with dismiss button when dismissible is true", async () => {
    const campaignName = "custom-campaign";
    setup({ dismissible: true, campaign: campaignName });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Dismiss banner" }),
      ).toBeInTheDocument();
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss banner" }),
    );

    const puts = await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      return puts;
    });

    expect(puts[0].url).toBe(
      `http://localhost/api/user-key-value/namespace/user_acknowledgement/key/upsell-${campaignName}`,
    );
  });

  it("should hide component when it has been dismissed", async () => {
    setup({
      userHasSeen: true,
      campaign: "custom-campaign-1",
      dismissible: true,
      title: "Test title 1",
    });
    setup({
      userHasSeen: false,
      campaign: "custom-campaign-2",
      dismissible: true,
      title: "Test title 2",
    });

    await waitFor(() => {
      expect(screen.getByText("Test title 2")).toBeInTheDocument();
    });

    expect(screen.queryByText("Test title 1")).not.toBeInTheDocument();
  });
});
