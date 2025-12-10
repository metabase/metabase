import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import NewModelOptions from "../NewModelOptions";

export interface SetupOpts {
  canCreateQueries?: boolean;
  canCreateNativeQueries?: boolean;
  showMetabaseLinks?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export function setup({
  canCreateQueries = false,
  canCreateNativeQueries = false,
  showMetabaseLinks = true,
  hasEnterprisePlugins,
  tokenFeatures = {},
}: SetupOpts) {
  const state = createMockState({
    currentUser: createMockUser({
      permissions: createMockUserPermissions({
        can_create_queries: canCreateQueries,
        can_create_native_queries: canCreateNativeQueries,
      }),
    }),
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(<Route path="*" component={NewModelOptions}></Route>, {
    withRouter: true,
    storeInitialState: state,
  });
}
