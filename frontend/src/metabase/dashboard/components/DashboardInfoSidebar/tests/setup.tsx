import { Route } from "react-router";

import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import {
  setupAuditInfoEndpoint,
  setupDashboardEndpoints,
  setupPerformanceEndpoints,
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { waitForLoaderToBeRemoved } from "__support__/ui";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import type { Dashboard, Settings, TokenFeatures } from "metabase-types/api";
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
  setupAuditInfoEndpoint();

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

  render(
    <Route
      path="*"
      component={() => (
        <MockDashboardContext
          dashboard={dashboard}
          setDashboardAttributes={setDashboardAttribute as any}
          closeSidebar={onClose}
        >
          <DashboardInfoSidebar />
        </MockDashboardContext>
      )}
    />,
    {
      withRouter: true,
      storeInitialState: {
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
          dashboards: [dashboard],
        }),
      },
    },
  );
  await waitForLoaderToBeRemoved();

  return {
    setDashboardAttribute,
    onClose,
    dashboard,
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
