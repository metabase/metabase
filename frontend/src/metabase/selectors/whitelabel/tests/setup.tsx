/* istanbul ignore file */

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import type { LoadingMessage, TokenFeatures } from "metabase-types/api";

export function setup({
  loadingMessage = "doing-science",
  tokenFeatures = {},
  hasEnterprisePlugins = false,
}: {
  loadingMessage?: LoadingMessage;
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
} = {}) {
  const state = createMockState({
    settings: mockSettings({
      "loading-message": loadingMessage,
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
