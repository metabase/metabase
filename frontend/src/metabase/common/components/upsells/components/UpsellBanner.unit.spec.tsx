import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  findRequests,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { UpsellBanner, type UpsellBannerProps } from "./UpsellBanner";

function setup(
  props: UpsellBannerProps,
  options?: {
    userHasSeen?: boolean;
  },
) {
  const finalOptions = {
    userHasSeen: false,
    ...options,
  };

  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: `upsell-${props.campaign}`,
    value: finalOptions.userHasSeen,
  });

  return renderWithProviders(
    <>
      <Route
        path="/internal-link"
        component={() => <div>Internal link content</div>}
      />
      <Route
        path="/"
        component={() => (
          <UpsellBanner {...props}>{props.children}</UpsellBanner>
        )}
      />
    </>,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
      withRouter: true,
      initialRoute: "/",
    },
  );
}

describe("UpsellsBanner > Upsell Banner", () => {
  it("should render a link with internalLink provided", async () => {
    setup({
      internalLink: "/internal-link",
      buttonText: "Test link text",
      title: "Test title",
      campaign: "test-campaign",
      location: "test-location",
      children: "Banner content",
    });

    await userEvent.click(screen.getByText("Test link text"));
    await waitFor(() => {
      expect(screen.getByText("Internal link content")).toBeInTheDocument();
    });
  });

  it("should call onClick when it is provided", async () => {
    const onClick = jest.fn();
    setup({
      buttonText: "Test button text",
      title: "Test title",
      campaign: "test-campaign",
      location: "test-location",
      children: "Banner content",
      buttonLink: "https://test-store.metabase.com",
      onClick,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Test button text" }),
    );

    expect(onClick).toHaveBeenCalled();
  });
});

describe("UpsellsBanner > Upsell Wrapper Dismissible", () => {
  it("should show a component when dismissible is false", async () => {
    setup({
      buttonText: "Test button text",
      title: "Test title",
      campaign: "test-campaign",
      location: "test-location",
      buttonLink: "https://test-store.metabase.com",
      children: "Banner content",
    });

    await waitFor(() => {
      expect(screen.getByText("Test title")).toBeInTheDocument();
    });
  });

  it("should show a component with dismiss button when dismissible is true", async () => {
    const campaignName = "custom-campaign";
    setup({
      dismissible: true,
      campaign: campaignName,
      title: "Test title",
      buttonText: "Test button text",
      buttonLink: "https://test-store.metabase.com",
      location: "test-location",
      children: "Banner content",
    });

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
    setup(
      {
        campaign: "custom-campaign-1",
        location: "test-location",
        dismissible: true,
        title: "Test title 1",
        buttonText: "Test button text 1",
        buttonLink: "https://test-store.metabase.com",
        children: "Banner content 1",
      },
      {
        userHasSeen: true,
      },
    );
    setup(
      {
        campaign: "custom-campaign-2",
        location: "test-location",
        dismissible: true,
        title: "Test title 2",
        buttonText: "Test button text 2",
        buttonLink: "https://test-store.metabase.com",
        children: "Banner content 2",
      },
      {
        userHasSeen: false,
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Test title 2")).toBeInTheDocument();
    });

    expect(screen.queryByText("Test title 1")).not.toBeInTheDocument();
  });
});
