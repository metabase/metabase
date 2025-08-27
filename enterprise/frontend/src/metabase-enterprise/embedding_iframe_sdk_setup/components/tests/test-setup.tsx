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
  showSimpleEmbedTerms?: boolean;
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
        "show-simple-embed-terms": options?.showSimpleEmbedTerms ?? true,
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

export async function waitForUpdateSetting(
  settingName: string,
  expectedValue?: unknown,
) {
  return waitForPutRequests().then((putRequests) => {
    const settingRequests = putRequests.filter((req) =>
      req.url.includes("/api/setting"),
    );

    const matchingRequest = settingRequests.find((req) => {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      return (
        settingName in body &&
        (expectedValue === undefined || body[settingName] === expectedValue)
      );
    });

    return matchingRequest;
  });
}
