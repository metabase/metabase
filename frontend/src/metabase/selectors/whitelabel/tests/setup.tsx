/* istanbul ignore file */

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import type { LoadingMessage, TokenFeatures } from "metabase-types/api";

export interface SetupOpts {
  loadingMessage?: LoadingMessage;
  applicationName?: string;
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
}

export function setup({
  loadingMessage = "doing-science",
  applicationName = "Metabase",
  tokenFeatures = {},
  hasEnterprisePlugins = false,
}: SetupOpts = {}) {
  const state = createMockState({
    settings: mockSettings({
      "loading-message": loadingMessage,
      "application-name": applicationName,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const {
    store: { getState },
  } = renderWithProviders(<></>, { storeInitialState: state });

  return { getState };
}
