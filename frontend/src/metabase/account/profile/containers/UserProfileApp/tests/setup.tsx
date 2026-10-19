import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures, User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import UserProfileApp from "../UserProfileApp";

export function setup({
  user = createMockUser(),
  isPasswordLoginEnabled = true,
  enterprisePlugins,
  tokenFeatures = {},
}: {
  user?: User;
  isPasswordLoginEnabled?: boolean;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
} = {}) {
  const state = createMockState({
    currentUser: user,
    settings: mockSettings({
      "enable-password-login": isPasswordLoginEnabled,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
  }

  renderWithProviders(<UserProfileApp />, { storeInitialState: state });
}
