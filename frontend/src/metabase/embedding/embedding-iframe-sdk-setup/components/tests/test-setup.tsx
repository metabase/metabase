import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  findRequests,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupNotificationChannelsEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, waitFor } from "__support__/ui";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins";
import {
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { SdkIframeEmbedSetupModal } from "../SdkIframeEmbedSetupModal";

export const setup = (options?: {
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  simpleEmbeddingEnabled?: boolean;
  showSimpleEmbedTerms?: boolean;
  jwtReady?: boolean;
  initialState?: SdkIframeEmbedSetupModalInitialState;
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
    "jwt-enabled": options?.jwtReady ?? false,
    "jwt-configured": options?.jwtReady ?? false,
    "jwt-enabled-and-configured": options?.jwtReady ?? false,
  });

  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"]);
  setupSearchEndpoints([]);
  setupDashboardEndpoints(mockDashboard);
  setupDashboardQueryMetadataEndpoint(
    mockDashboard,
    createMockDashboardQueryMetadata({
      databases: [mockDatabase],
    }),
  );
  setupUpdateSettingsEndpoint();
  setupUpdateSettingEndpoint();
  setupNotificationChannelsEndpoints({});

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
