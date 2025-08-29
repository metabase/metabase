import {
  findRequests,
  setupDashboardEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, waitFor } from "__support__/ui";
import { createMockDashboard } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { SdkIframeEmbedSetup } from "../SdkIframeEmbedSetup";

export const setup = (options?: {
  simpleEmbeddingEnabled?: boolean;
  jwtReady?: boolean;
}) => {
  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"]);
  setupDashboardEndpoints(createMockDashboard());
  setupUpdateSettingsEndpoint();
  setupUpdateSettingEndpoint();

  renderWithProviders(<SdkIframeEmbedSetup />, {
    storeInitialState: createMockState({
      settings: createMockSettingsState({
        "enable-embedding-simple": options?.simpleEmbeddingEnabled ?? false,
        "jwt-enabled": options?.jwtReady ?? false,
        "jwt-configured": options?.jwtReady ?? false,
      }),
    }),
  });
};

export async function waitForPutRequests() {
  return waitFor(async () => {
    const puts = await findRequests("PUT");
    expect(puts.length).toBeGreaterThan(0);
    return puts;
  });
}
