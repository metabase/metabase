import { Route } from "react-router";

import {
  setupAuditEndpoints,
  setupDashboardEndpoints,
  setupPerformanceEndpoints,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import {
  type RenderWithProvidersOptions,
  renderWithProviders,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { Dashboard, Settings } from "metabase-types/api";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { DashboardInfoSidebar } from "../DashboardInfoSidebar";

export interface SetupOpts extends RenderWithProvidersOptions {
  dashboard?: Dashboard;
  settings?: Settings;
}

export async function setup({
  dashboard = createMockDashboard(),
  ...renderOptions
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
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      dashboards: [dashboard],
    }),
  });

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
    {
      storeInitialState: state,
      withRouter: true,
      ...renderOptions,
    },
  );
  await waitForLoaderToBeRemoved();

  return {
    setDashboardAttribute,
    onClose,
  };
}
