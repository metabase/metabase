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
}

function setup({ isHosted }: SetupOpts) {
  setupTrialAvailableEndpoint({
    available: true,
    plan_alias: "pro-cloud",
  });

  renderWithProviders(<UpsellCardContent {...defaultProps} />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings({
        "is-hosted?": isHosted,
      }),
    }),
  });
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
});
