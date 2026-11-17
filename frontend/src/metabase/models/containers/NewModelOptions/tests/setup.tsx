import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import { Route } from "metabase/router";
import type { DatabaseId, TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

import NewModelOptions from "../NewModelOptions";

export interface SetupOpts {
  canCreateQueries?: boolean;
  canCreateNativeQueries?: boolean;
  showMetabaseLinks?: boolean;
  lastUsedDatabaseId?: DatabaseId | null;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export function setup({
  canCreateQueries = false,
  canCreateNativeQueries = false,
  showMetabaseLinks = true,
  lastUsedDatabaseId = null,
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
      "last-used-native-database-id": lastUsedDatabaseId,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  renderWithProviders(<Route path="*" element={<NewModelOptions />}></Route>, {
    withRouter: true,
    storeInitialState: state,
  });
}
