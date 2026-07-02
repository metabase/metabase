import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
  setupNotificationChannelsEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, waitFor } from "__support__/ui";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockCollection,
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { SdkIframeEmbedSetupModal } from "../SdkIframeEmbedSetupModal";

export const setup = (options?: {
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  simpleEmbeddingEnabled?: boolean;
  showSimpleEmbedTerms?: boolean;
  guestEmbeddingEnabled?: boolean;
  showStaticEmbedTerms?: boolean;
  jwtReady?: boolean;
  initialState?: SdkIframeEmbedSetupModalInitialState;
  hasEmailSetup?: boolean;
  metabotEnabled?: boolean;
  siteUrl?: string;
}) => {
  const { enterprisePlugins } = options ?? {};

  const mockDatabase = createMockDatabase();
  const mockDashboard = createMockDashboard({
    enable_embedding: true,
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
  }

  const tokenFeatures = createMockTokenFeatures({
    embedding_simple: options?.simpleEmbeddingEnabled ?? false,
  });
  const settingValues = createMockSettings({
    "token-features": tokenFeatures,
    "show-simple-embed-terms": options?.showSimpleEmbedTerms ?? false,
    "enable-embedding-simple": options?.simpleEmbeddingEnabled ?? false,
    "show-static-embed-terms": options?.showStaticEmbedTerms ?? false,
    "enable-embedding-static": options?.guestEmbeddingEnabled ?? false,
    "jwt-enabled": options?.jwtReady ?? false,
    "jwt-configured": options?.jwtReady ?? false,
    "jwt-enabled-and-configured": options?.jwtReady ?? false,
    "embedded-metabot-enabled?": options?.metabotEnabled ?? false,
    "llm-metabot-configured?": options?.metabotEnabled ?? false,
    // Default to the jsdom test origin so the embed wizard preview renders
    // (mismatched origins surface a Site URL configuration error).
    "site-url": options?.siteUrl ?? window.location.origin,
  });

  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"]);
  setupSearchEndpoints([]);
  setupDatabasesEndpoints([mockDatabase]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root", name: "Our analytics" })],
  });
  setupDashboardEndpoints(mockDashboard);
  setupDashboardQueryMetadataEndpoint(
    mockDashboard,
    createMockDashboardQueryMetadata({
      databases: [mockDatabase],
    }),
  );
  setupUpdateSettingsEndpoint();
  setupUpdateSettingEndpoint();
  setupNotificationChannelsEndpoints(
    options?.hasEmailSetup ? { email: { configured: true } as any } : {},
  );
  fetchMock.get("path:/api/embed-theme", []);

  renderWithProviders(
    <SdkIframeEmbedSetupModal
      opened
      initialState={{
        isGuest: false,
        useExistingUserSession: true,
        ...options?.initialState,
      }}
      onClose={jest.fn()}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings(settingValues),
      }),
    },
  );
};

export async function waitForUpdateSetting(settingKey: string, value: any) {
  return waitFor(async () => {
    const puts = await findRequests("PUT");

    return puts.find(
      (request) =>
        request.url.includes("/api/setting") &&
        request.body[settingKey] === value,
    );
  });
}
