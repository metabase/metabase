import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionsEndpoints,
  setupDatabaseListEndpoint,
  setupLibraryEndpoints,
  setupListTransformsEndpoint,
  setupNativeQuerySnippetEndpoints,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { getContentStudioRoutes } from "../routes";

export type SetupOpts = {
  initialRoute?: string;
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
};

export function setup({
  initialRoute = "/content-studio",
  isAdmin = true,
  remoteSyncEnabled = false,
  tokenFeatures,
  enterprisePlugins,
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "remote-sync-enabled": remoteSyncEnabled,
    "remote-sync-branch": "main",
    "remote-sync-type": "read-write",
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);
  setupRemoteSyncEndpoints({ branches: ["main"] });
  setupLibraryEndpoints(false);
  setupUserKeyValueEndpoints({
    namespace: "content_studio",
    key: "isNavbarOpened",
    value: true,
  });
  setupUserKeyValueEndpoints({
    namespace: "content_studio",
    key: "areCollectionsExpanded",
    value: true,
  });
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-remote-sync-dev-instance",
    value: false,
  });
  setupCollectionsEndpoints({ collections: [] });
  setupNativeQuerySnippetEndpoints();
  setupListTransformsEndpoint([]);
  setupDatabaseListEndpoint([]);

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings(settings),
  });

  enterprisePlugins?.forEach(setupEnterpriseOnlyPlugin);

  renderWithProviders(
    <Route path="/">
      {getContentStudioRoutes()}
      <Route path="unauthorized" element={<div>{"Unauthorized"}</div>} />
    </Route>,
    {
      initialRoute,
      withRouter: true,
      storeInitialState,
    },
  );
}
