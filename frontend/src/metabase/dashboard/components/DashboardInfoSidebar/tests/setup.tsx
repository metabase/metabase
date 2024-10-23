import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAuditEndpoints,
  setupDashboardEndpoints,
  setupPerformanceEndpoints,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import type { Dashboard, Settings, TokenFeatures } from "metabase-types/api";
import {
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { DashboardInfoSidebar } from "../DashboardInfoSidebar";

export interface SetupOpts {
  dashboard?: Dashboard;
  settings?: Settings;
  hasEnterprisePlugins?: boolean;
}

export async function setup({
  dashboard = createMockDashboard(),
  settings = createMockSettings(),
  hasEnterprisePlugins,
}: SetupOpts = {}) {
  const setDashboardAttribute = jest.fn();
  const onClose = jest.fn();

  const currentUser = createMockUser();
  setupDashboardEndpoints(dashboard);
  setupUsersEndpoints([currentUser]);
  setupRevisionsEndpoints([]);
  setupPerformanceEndpoints([]);
  setupAuditEndpoints();

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
      dashboards: [dashboard],
    }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <Route
      path="*"
      component={() => (
        <DashboardInfoSidebar
          dashboard={dashboard}
          setDashboardAttribute={setDashboardAttribute}
          onClose={onClose}
        />
      )}
    />,
    { storeInitialState: state, withRouter: true },
  );
  await waitForLoaderToBeRemoved();

  return {
    setDashboardAttribute,
    onClose,
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
    hasEnterprisePlugins: true,
  });
};
