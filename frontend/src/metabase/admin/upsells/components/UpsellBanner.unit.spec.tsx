import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { UpsellBanner } from "./UpsellBanner";

function setup({
  dismissable = false,
  userHasSeen = false,
  campaign = "test-campaign",
  title = "Test title",
}: {
  dismissable?: boolean;
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
      dismissable={dismissable}
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

describe("UpsellsBanner > Upsell Wrapper Dismissable", () => {
  it("should show a component when dismissable is false", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText("Test title")).toBeInTheDocument();
    });
  });

  it("should show a component with dismiss button when dismissable is true", async () => {
    const campaignName = "custom-campaign";
    setup({ dismissable: true, campaign: campaignName });

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
      dismissable: true,
      title: "Test title 1",
    });
    setup({
      userHasSeen: false,
      campaign: "custom-campaign-2",
      dismissable: true,
      title: "Test title 2",
    });

    await waitFor(() => {
      expect(screen.queryByText("Test title 2")).not.toBeInTheDocument();
    });

    expect(screen.queryByText("Test title 1")).not.toBeInTheDocument();
  });
});
