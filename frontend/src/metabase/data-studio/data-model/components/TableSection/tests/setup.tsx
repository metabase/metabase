import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupUserKeyValueEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { RouteParams } from "metabase/data-studio/data-model/pages/DataModel/types";
import type { DataStudioTableMetadataTab } from "metabase/lib/urls";
import type {
  EnterpriseSettings,
  Segment,
  Table,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockTable,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { TableSection } from "../TableSection";

export type SetupOpts = {
  table?: Table;
  params?: RouteParams;
  activeTab?: DataStudioTableMetadataTab;
  segments?: Segment[];
  isAdmin?: boolean;
  isDataAnalyst?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
};

export function setup({
  table = createMockTable(),
  activeTab = "field",
  segments,
  isAdmin = false,
  isDataAnalyst = false,
  remoteSyncType,
  enterprisePlugins,
  tokenFeatures,
}: SetupOpts = {}) {
  const onSyncOptionsClick = jest.fn();
  const tableWithSegments = segments ? { ...table, segments } : table;

  const settings = mockSettings({
    "remote-sync-type": remoteSyncType,
    "remote-sync-enabled": !!remoteSyncType,
    "token-features": createMockTokenFeatures(tokenFeatures),
  });
  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: isAdmin,
      is_data_analyst: isDataAnalyst,
    }),
    settings,
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  setupUsersEndpoints([createMockUser()]);
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "seen-publish-tables-info",
    value: true,
  });

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <TableSection
          table={tableWithSegments}
          activeTab={activeTab}
          hasLibrary
          canPublish
          onSyncOptionsClick={onSyncOptionsClick}
        />
      )}
    />,
    {
      withRouter: true,
      storeInitialState: state,
    },
  );

  return { onSyncOptionsClick };
}
