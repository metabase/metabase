import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  type AuditInfo,
  setupAuditInfoEndpoint,
  setupDashboardEndpoints,
  setupPerformanceEndpoints,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { setDashboardAttributes } from "metabase/dashboard/actions/core";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { Route } from "metabase/router";
import type {
  Dashboard,
  Revision,
  Settings,
  TokenFeatures,
  User,
} from "metabase-types/api";
import {
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { DashboardInfoSidebar } from "../DashboardInfoSidebar";

export interface SetupOpts {
  dashboard?: Dashboard;
  settings?: Settings;
  revisions?: Revision[];
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  auditInfo?: Partial<AuditInfo>;
  user?: Partial<User>;
}

export async function setup({
  dashboard = createMockDashboard(),
  settings = createMockSettings(),
  revisions = [],
  enterprisePlugins = [],
  auditInfo,
  user,
}: SetupOpts = {}) {
  const setDashboardAttribute = Object.assign(
    jest.fn(setDashboardAttributes),
    setDashboardAttributes,
  );
  const onClose = jest.fn();

  const currentUser = createMockUser(user);
  setupDashboardEndpoints(dashboard);
  setupUsersEndpoints([currentUser]);
  setupRevisionsEndpoints(revisions);
  setupPerformanceEndpoints([]);
  setupAuditInfoEndpoint({ auditInfo });

  const state = createMockState({
    currentUser,
    settings: mockSettings({
      ...settings,
      "token-features": createMockTokenFeatures(
        settings["token-features"] || {},
      ),
    }),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  const { store } = renderWithProviders(
    <Route
      path="*"
      element={
        <MockDashboardContext
          dashboard={dashboard}
          setDashboardAttributes={setDashboardAttribute}
          closeSidebar={onClose}
        >
          <DashboardInfoSidebar />
          <UndoListing />
        </MockDashboardContext>
      }
    />,
    { storeInitialState: state, withRouter: true },
  );
  await waitForLoaderToBeRemoved();

  return {
    setDashboardAttribute,
    onClose,
    dashboard,
    store,
  };
}

export const setupEnterprise = (
  opts: SetupOpts = {},
  tokenFeatures: Partial<TokenFeatures> = {},
) => {
  return setup({
    ...opts,
    settings: createMockSettings({
      ...opts.settings,
      "token-features": createMockTokenFeatures({
        ...tokenFeatures,
      }),
    }),
  });
};
