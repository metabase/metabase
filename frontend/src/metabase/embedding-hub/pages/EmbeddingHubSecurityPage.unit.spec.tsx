import {
  setupEmbeddableEntitiesEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUpsellEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Card, Dashboard, Settings } from "metabase-types/api";
import {
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { EmbeddingHubSecurityPage } from "./EmbeddingHubSecurityPage";

interface SetupOpts {
  isGuestEmbedsEnabled?: Settings["enable-embedding-static"];
  dashboards?: Dashboard[];
  cards?: Card[];
}

function setup({
  isGuestEmbedsEnabled = false,
  dashboards = [],
  cards = [],
}: SetupOpts) {
  const settings = createMockSettings({
    "enable-embedding-static": isGuestEmbedsEnabled,
    "token-features": createMockTokenFeatures(),
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupUpsellEndpoints();
  setupEmbeddableEntitiesEndpoints({ dashboards, cards });

  renderWithProviders(<EmbeddingHubSecurityPage />, {
    storeInitialState: createMockState({ settings: mockSettings(settings) }),
  });
}

describe("EmbeddingHubSecurityPage", () => {
  it("lists published guest embeds even when guest embeds are turned off", async () => {
    setup({
      isGuestEmbedsEnabled: false,
      dashboards: [createMockDashboard({ name: "Published dashboard" })],
    });

    expect(
      await screen.findByText("Published guest embeds"),
    ).toBeInTheDocument();
    expect(await screen.findByText("Published dashboard")).toBeInTheDocument();
  });

  it("hides the card when nothing is published, even with guest embeds on", async () => {
    setup({ isGuestEmbedsEnabled: true });

    await screen.findByText("Embedding secret key");

    await waitFor(() => {
      expect(
        screen.queryByText("Published guest embeds"),
      ).not.toBeInTheDocument();
    });
  });
});
