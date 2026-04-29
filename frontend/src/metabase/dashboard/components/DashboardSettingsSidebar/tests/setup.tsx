import { Route } from "react-router";

import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import {
  setupDashboardEndpoints,
  setupPerformanceEndpoints,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { waitForLoaderToBeRemoved } from "__support__/ui";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import type { Dashboard, Settings } from "metabase-types/api";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { DashboardSettingsSidebar } from "../DashboardSettingsSidebar";

export interface SetupOpts {
  dashboard?: Dashboard;
  settings?: Settings;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
}

export async function setup({
  dashboard = createMockDashboard(),
  settings,
  enterprisePlugins = [],
}: SetupOpts = {}) {
  const setDashboardAttribute = jest.fn();
  const onClose = jest.fn();

  const currentUser = createMockUser();
  setupDashboardEndpoints(dashboard);
  setupUsersEndpoints([currentUser]);
  setupRevisionsEndpoints([]);
  setupPerformanceEndpoints([]);

  const builder = createScenario()
    .withUser(currentUser)
    .withEnterprise({
      plugins: enterprisePlugins,
      tokenFeatures: settings?.["token-features"] ?? {},
    });
  if (settings) {
    builder.withSettings(settings as unknown as Record<string, unknown>);
  }
  const { render } = builder.build();

  const TestDashboardSettingsSidebar = () => (
    <MockDashboardContext dashboard={dashboard} closeSidebar={onClose}>
      <DashboardSettingsSidebar />
    </MockDashboardContext>
  );

  render(<Route path="*" component={TestDashboardSettingsSidebar} />, {
    withRouter: true,
    storeInitialState: {
      entities: createMockEntitiesState({
        databases: [createSampleDatabase()],
        dashboards: [dashboard],
      }),
    },
  });
  await waitForLoaderToBeRemoved();

  return {
    setDashboardAttribute,
    onClose,
  };
}
