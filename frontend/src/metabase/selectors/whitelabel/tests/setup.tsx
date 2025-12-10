/* istanbul ignore file */

import {
  setupEnterpriseOnlyPlugin,
  setupEnterprisePlugins,
} from "__support__/enterprise";
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
  hasEnterprisePlugins?: boolean;
  specificPlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export function setup({
  loadingMessage = "doing-science",
  applicationName = "Metabase",
  showMetabaseLinks = true,
  tokenFeatures = {},
  hasEnterprisePlugins = false,
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

  if (hasEnterprisePlugins) {
    if (specificPlugins.length > 0) {
      specificPlugins.forEach((plugin) => {
        setupEnterpriseOnlyPlugin(plugin);
      });
    } else {
      setupEnterprisePlugins();
    }
  }

  const {
    store: { getState },
  } = renderWithProviders(<></>, { storeInitialState: state });

  return { getState };
}
