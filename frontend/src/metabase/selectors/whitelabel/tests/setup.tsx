/* istanbul ignore file */

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { LoadingMessage, TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

export interface SetupOpts {
  loadingMessage?: LoadingMessage;
  applicationName?: string;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  specificPlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export function setup({
  loadingMessage = "doing-science",
  applicationName = "Metabase",
  showMetabaseLinks = true,
  tokenFeatures = {},
  specificPlugins = [],
}: SetupOpts = {}) {
  const state = createMockState({
    settings: mockSettings({
      "loading-message": loadingMessage,
      "application-name": applicationName,
      "token-features": createMockTokenFeatures(tokenFeatures),
      "show-metabase-links": showMetabaseLinks,
    }),
  });

  specificPlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  const {
    store: { getState },
  } = renderWithProviders(<></>, { storeInitialState: state });

  return { getState };
}
