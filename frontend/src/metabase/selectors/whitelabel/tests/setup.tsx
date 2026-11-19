/* istanbul ignore file */

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState, seedApiQueryCache } from "__support__/state";
import type { LoadingMessage, TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

export interface SetupOpts {
  loadingMessage?: LoadingMessage;
  applicationName?: string;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export function setup({
  loadingMessage = "doing-science",
  applicationName = "Metabase",
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupOpts = {}) {
  const state = createMockState({
    settings: mockSettings({
      "loading-message": loadingMessage,
      "application-name": applicationName,
      "token-features": createMockTokenFeatures(tokenFeatures),
      "show-metabase-links": showMetabaseLinks,
    }),
  });

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  // These are pure selector tests. Seed the same fulfilled session-properties
  // cache the app reads, without mounting an otherwise empty app tree. Each
  // fixture must own its settings rather than read the latest global bootstrap.
  state["metabase-api"] = seedApiQueryCache(state["metabase-api"], [
    { endpointName: "getSessionProperties", value: state.settings.values },
  ]);

  return { getState: () => state };
}
