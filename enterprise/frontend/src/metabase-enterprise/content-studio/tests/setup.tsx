import fetchMock from "fetch-mock";
import type { ReactNode } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import {
  type RemoteSyncExportPreflightResponse,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import type {
  Collection,
  EnterpriseSettings,
  RemoteSyncEntity,
  RemoteSyncWorktree,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { ContentStudioScopeProvider } from "../scope";

/**
 * Numeric ids only, so this route cannot swallow `/api/collection/tree` or
 * `/api/collection/root` whatever order the mocks are registered in.
 */
const COLLECTION_BY_ID_URL = /\/api\/collection\/\d+(\?.*)?$/;

/** What an EE instance with Content Studio available looks like. */
const DEFAULT_EE_SETTINGS = {
  enterprisePlugins: ["remote_sync", "content_studio"],
  tokenFeatures: { remote_sync: true },
} satisfies Pick<ContentStudioSetupOpts, "enterprisePlugins" | "tokenFeatures">;

export type ContentStudioSetupOpts = {
  /** Rendered under `/content-studio`, inside the scope provider. */
  routes: ReactNode;
  /** Rendered as a sibling of the routed outlet, for probes and chrome. */
  chrome?: ReactNode;
  initialRoute?: string;
  isAdmin?: boolean;
  withDND?: boolean;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
  tokenFeatures?: Partial<TokenFeatures>;
  settings?: Partial<EnterpriseSettings>;
  worktrees?: RemoteSyncWorktree[];
  branches?: string[];
  dirty?: RemoteSyncEntity[];
  changedCollections?: Record<number, boolean>;
  isDirty?: boolean;
  hasRemoteChanges?: boolean;
  exportPreflight?: Partial<RemoteSyncExportPreflightResponse>;
  /**
   * Answers `/api/collection/tree` — the main branch's collections, and any
   * branch's under `?worktree-id=…`. Leave both out for a spec that sets the
   * collection endpoints up itself.
   */
  collections?: Collection[];
  branchCollections?: Collection[];
  /** Answers `/api/collection/:id` for any other collection. */
  collectionById?: Collection;
};

/**
 * Renders Content Studio routes against an EE instance with remote sync set up.
 * Mocks the settings, remote-sync and collection endpoints every Content Studio
 * screen loads; specs add whatever else the screen under test needs.
 */
export function setupContentStudio({
  routes,
  chrome,
  initialRoute = "/content-studio",
  isAdmin = true,
  withDND = false,
  enterprisePlugins = DEFAULT_EE_SETTINGS.enterprisePlugins,
  tokenFeatures = DEFAULT_EE_SETTINGS.tokenFeatures,
  settings: settingOverrides,
  worktrees = [],
  branches,
  dirty = [],
  changedCollections,
  isDirty = false,
  hasRemoteChanges = false,
  exportPreflight,
  collections,
  branchCollections,
  collectionById,
}: ContentStudioSetupOpts) {
  const settings = createMockSettings({
    "remote-sync-enabled": true,
    "remote-sync-branch": "main",
    "remote-sync-type": "read-write",
    ...settingOverrides,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);
  setupRemoteSyncEndpoints({
    worktrees,
    dirty,
    changedCollections,
    isDirty,
    hasRemoteChanges,
    exportPreflight,
    ...(branches ? { branches } : {}),
  });
  setupUserKeyValueEndpoints({
    namespace: "content_studio",
    key: "areCollectionsExpanded",
    value: true,
  });

  if (collectionById != null) {
    fetchMock.get(COLLECTION_BY_ID_URL, collectionById);
  }

  if (collections != null || branchCollections != null) {
    fetchMock.get("path:/api/collection/tree", (call) => {
      const worktreeId = new URL(call.url).searchParams.get("worktree-id");
      return (worktreeId == null ? collections : branchCollections) ?? [];
    });
    // The new-collection form looks up a default parent even with its picker hidden.
    fetchMock.get(
      "path:/api/collection/root",
      createMockCollection({ id: "root" }),
    );
  }

  enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);

  return renderWithProviders(
    <Route path="/">
      <Route
        path="content-studio"
        element={
          <ContentStudioScopeProvider>
            <Outlet />
            {chrome}
          </ContentStudioScopeProvider>
        }
      >
        {routes}
      </Route>
    </Route>,
    {
      initialRoute,
      withRouter: true,
      withDND,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: mockSettings(settings),
      }),
    },
  );
}
