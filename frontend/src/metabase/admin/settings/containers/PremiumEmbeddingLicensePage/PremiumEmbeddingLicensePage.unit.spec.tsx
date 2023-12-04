import type { StoreTokenStatus } from "metabase-types/api";
import {
  createMockSettingDefinition,
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
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import PremiumEmbeddingLicensePage from "./PremiumEmbeddingLicensePage";

interface SetupOpts {
  tokenStatus?: StoreTokenStatus;
}

const setup = async ({
  tokenStatus = createMockStoreTokenStatus(),
}: SetupOpts = {}) => {
  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "premium-embedding-token",
    }),
  ]);
  setupStoreTokenEndpoints(tokenStatus);

  renderWithProviders(<PremiumEmbeddingLicensePage />);

  await waitForLoaderToBeRemoved();
};

describe("PremiumEmbeddingLicensePage", () => {
  it("should not display a link to upgrade the license when there is no token", async () => {
    await setup();

    const link = screen.queryByRole("link", {
      name: "Explore our paid plans.",
    });
    expect(link).not.toBeInTheDocument();
  });

  it("should display a link to upgrade the license when the token is invalid", async () => {
    await setup({
      tokenStatus: createMockStoreTokenStatus({ status: "invalid" }),
    });

    const link = screen.getByRole("link", {
      name: "Explore our paid plans.",
    });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("embed_premium"),
    );
  });
});
