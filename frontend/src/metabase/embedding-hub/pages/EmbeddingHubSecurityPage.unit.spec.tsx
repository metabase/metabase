import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
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
  isGuestEmbedsEnabled?: Settings["enable-embedding-modular"];
  isFullAppEmbeddingEnabled?: Settings["enable-embedding-interactive"];
  hasSimpleEmbedding?: boolean;
  dashboards?: Dashboard[];
  cards?: Card[];
}

function setup({
  isGuestEmbedsEnabled = false,
  isFullAppEmbeddingEnabled = false,
  hasSimpleEmbedding = false,
  dashboards = [],
  cards = [],
}: SetupOpts) {
  const settings = createMockSettings({
    "enable-embedding-modular": isGuestEmbedsEnabled,
    "enable-embedding-interactive": isFullAppEmbeddingEnabled,
    "token-features": createMockTokenFeatures({
      embedding_simple: hasSimpleEmbedding,
      embedding: isFullAppEmbeddingEnabled,
    }),
  });

  const state = createMockState({ settings: mockSettings(settings) });

  // The plugin reads the token features at init, so the store has to be
  // populated before it registers the authorized-origins widget.
  if (isFullAppEmbeddingEnabled) {
    setupEnterpriseOnlyPlugin("embedding");
  }

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupUpsellEndpoints();
  setupEmbeddableEntitiesEndpoints({ dashboards, cards });

  renderWithProviders(<EmbeddingHubSecurityPage />, {
    storeInitialState: state,
  });
}

describe("EmbeddingHubSecurityPage", () => {
  describe("published guest embeds", () => {
    it("lists published guest embeds even when guest embeds are turned off", async () => {
      setup({
        isGuestEmbedsEnabled: false,
        dashboards: [createMockDashboard({ name: "Published dashboard" })],
      });

      expect(
        await screen.findByText("Published guest embeds"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("Published dashboard"),
      ).toBeInTheDocument();
    });

    it("hides the card when nothing is published, even with guest embeds on", async () => {
      setup({ isGuestEmbedsEnabled: true });

      await screen.findByText("Secret key for guest embeds");

      await waitFor(() => {
        expect(
          screen.queryByText("Published guest embeds"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("CORS", () => {
    it("shows CORS on an instance whose only embedding method is guest", async () => {
      setup({ hasSimpleEmbedding: false });

      expect(
        await screen.findByText("Cross-Origin Resource Sharing (CORS)"),
      ).toBeInTheDocument();
    });
  });

  describe("SameSite cookie setting", () => {
    it("is hidden on an instance whose only embedding method is guest", async () => {
      setup({ hasSimpleEmbedding: false });

      await screen.findByText("Secret key for guest embeds");

      await waitFor(() => {
        expect(
          screen.queryByText("SameSite cookie setting"),
        ).not.toBeInTheDocument();
      });
    });

    it("is shown once modular embedding is available", async () => {
      setup({ hasSimpleEmbedding: true });

      expect(
        await screen.findByText("SameSite cookie setting"),
      ).toBeInTheDocument();
    });
  });

  describe("full-app authorized origins", () => {
    it("is hidden when full-app embedding is off", async () => {
      setup({ hasSimpleEmbedding: true, isFullAppEmbeddingEnabled: false });

      await screen.findByText("Secret key for guest embeds");

      await waitFor(() => {
        expect(
          screen.queryByText("Authorized origins for full-app embedding"),
        ).not.toBeInTheDocument();
      });
    });

    it("is shown when full-app embedding is on", async () => {
      setup({ hasSimpleEmbedding: true, isFullAppEmbeddingEnabled: true });

      expect(
        await screen.findByText("Authorized origins for full-app embedding"),
      ).toBeInTheDocument();
    });
  });
});
