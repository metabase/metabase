import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import UserProfileApp from "../UserProfileApp";

export function setup({
  isPasswordLoginEnabled = true,
  hasEnterprisePlugins = false,
  tokenFeatures = {},
}: {
  isPasswordLoginEnabled?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
} = {}) {
  const state = createMockState({
    settings: mockSettings({
      "enable-password-login": isPasswordLoginEnabled,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<UserProfileApp />, { storeInitialState: state });
}
