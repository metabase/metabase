import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDashboardEndpoints,
  setupPerformanceEndpoints,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import type { Dashboard, Settings } from "metabase-types/api";
import {
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { DashboardSettingsSidebar } from "../DashboardSettingsSidebar";

export interface SetupOpts {
  dashboard?: Dashboard;
  settings?: Settings;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export async function setup({
  dashboard = createMockDashboard(),
  settings = createMockSettings(),
  enterprisePlugins = [],
}: SetupOpts = {}) {
  const setDashboardAttribute = jest.fn();
  const onClose = jest.fn();

  const currentUser = createMockUser();
  setupDashboardEndpoints(dashboard);
  setupUsersEndpoints([currentUser]);
  setupRevisionsEndpoints([]);
  setupPerformanceEndpoints([]);

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

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  const TestDashboardSettingsSidebar = () => (
    <MockDashboardContext dashboard={dashboard} closeSidebar={onClose}>
      <DashboardSettingsSidebar />
    </MockDashboardContext>
  );

  renderWithProviders(
    <Route path="*" component={TestDashboardSettingsSidebar} />,

    { storeInitialState: state, withRouter: true },
  );
  await waitForLoaderToBeRemoved();

  return {
    setDashboardAttribute,
    onClose,
  };
}
