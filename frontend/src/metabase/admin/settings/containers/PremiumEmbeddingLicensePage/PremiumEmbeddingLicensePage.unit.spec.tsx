import React from "react";
import { StoreTokenStatus } from "metabase-types/api";
import {
  createMockSettings,
  createMockStoreTokenStatus,
} from "metabase-types/api/mocks";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupStoreTokenEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import PremiumEmbeddingLicensePage from "./PremiumEmbeddingLicensePage";

interface SetupOpts {
  tokenStatus?: StoreTokenStatus;
}

const setup = async ({
  tokenStatus = createMockStoreTokenStatus(),
}: SetupOpts = {}) => {
  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([]);
  setupStoreTokenEndpoints(tokenStatus);

  renderWithProviders(<PremiumEmbeddingLicensePage />);

  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );
};

describe("PremiumEmbeddingLicensePage", () => {
  it("should display a link to upgrade the license when the token is invalid", async () => {
    await setup({ tokenStatus: createMockStoreTokenStatus({ valid: false }) });

    const link = screen.getByRole("link", {
      name: "Explore our paid plans.",
    });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("embed_premium"),
    );
  });
});
