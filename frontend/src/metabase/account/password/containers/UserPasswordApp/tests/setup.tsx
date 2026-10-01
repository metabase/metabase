import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupMfaStatusEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import type { MfaStatus, TokenFeatures, User } from "metabase-types/api";
import {
  createMockMfaStatus,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import UserPasswordApp from "../UserPasswordApp";

type SetupOpts = {
  user?: User;
  mfaStatus?: MfaStatus;
  hasMfaPlugin?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
};

export function setup({
  user = createMockUser(),
  mfaStatus = createMockMfaStatus(),
  hasMfaPlugin = false,
  tokenFeatures = {},
}: SetupOpts = {}) {
  setupMfaStatusEndpoint(mfaStatus);

  if (hasMfaPlugin) {
    setupEnterpriseOnlyPlugin("multi_factor_auth");
  }

  renderWithProviders(<UserPasswordApp />, {
    storeInitialState: createMockState({
      currentUser: user,
      settings: mockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
    }),
  });
}
