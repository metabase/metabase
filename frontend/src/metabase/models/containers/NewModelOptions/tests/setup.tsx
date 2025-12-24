import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
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
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export function setup({
  canCreateQueries = false,
  canCreateNativeQueries = false,
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
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

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  renderWithProviders(<Route path="*" component={NewModelOptions}></Route>, {
    withRouter: true,
    storeInitialState: state,
  });
}
