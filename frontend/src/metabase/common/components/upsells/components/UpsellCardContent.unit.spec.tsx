import fetchMock from "fetch-mock";

import { setupTrialAvailableEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import type { UpsellCardContentProps } from "./UpsellCardContent";
import { UpsellCardContent } from "./UpsellCardContent";

const defaultProps: UpsellCardContentProps = {
  campaign: "test-campaign",
  location: "test-location",
  title: "Test Title",
  description: "Test description",
};

interface SetupOpts {
  isHosted: boolean;
  isAdmin?: boolean;
  isStoreUser?: boolean;
}

function setup({ isHosted, isAdmin = true, isStoreUser = false }: SetupOpts) {
  setupTrialAvailableEndpoint({
    available: true,
    plan_alias: "pro-cloud",
  });

  const currentUser = createMockUser({
    email: "user@example.com",
    is_superuser: isAdmin,
  });

  renderWithProviders(
    <UpsellCardContent {...defaultProps} upgradeOnClick={jest.fn()} />,
    {
      storeInitialState: createMockState({
        currentUser,
        settings: mockSettings({
          "is-hosted?": isHosted,
          "token-status": {
            valid: true,
            status: "",
            features: [],
            "store-users": [
              { email: isStoreUser ? currentUser.email : "store@example.com" },
            ],
          },
        }),
      }),
    },
  );
}

describe("UpsellCardContent", () => {
  describe("trial availability check", () => {
    it("should call trial availability endpoint when isHosted is true", async () => {
      setup({ isHosted: true });

      await screen.findByText("Test Title");

      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/cloud-proxy/mb-plan-trial-up-available",
        ),
      ).toBe(true);
    });

    it("should not call trial availability endpoint when isHosted is false", async () => {
      setup({ isHosted: false });

      await screen.findByText("Test Title");

      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/cloud-proxy/mb-plan-trial-up-available",
        ),
      ).toBe(false);
    });
  });

  describe("upgrade action", () => {
    it("shows the trial CTA when hosted user is an admin", async () => {
      setup({ isHosted: true, isAdmin: true, isStoreUser: false });

      expect(
        await screen.findByRole("button", { name: "Try for free" }),
      ).toBeInTheDocument();
    });

    it("shows the trial CTA when hosted user is a store user", async () => {
      setup({ isHosted: true, isAdmin: false, isStoreUser: true });

      expect(
        await screen.findByRole("button", { name: "Try for free" }),
      ).toBeInTheDocument();
    });

    it("shows the contact admin message when hosted user is not an admin or store user", async () => {
      setup({ isHosted: true, isAdmin: false, isStoreUser: false });

      expect(
        await screen.findByText(
          "Please ask a Metabase Store Admin (store@example.com) to upgrade your plan.",
        ),
      ).toBeInTheDocument();
    });
  });
});
