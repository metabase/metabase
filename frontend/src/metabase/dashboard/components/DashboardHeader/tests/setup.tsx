import { Route } from "react-router";

import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import {
  createScenario,
  setupCollectionsScenario,
  setupNotificationChannelsScenario,
} from "__support__/scenarios";
import { waitForLoaderToBeRemoved } from "__support__/ui";
import { getDefaultTab } from "metabase/dashboard/actions";
import { DASHBOARD_APP_ACTIONS } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import type { Collection, TokenFeatures } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";

import { DashboardHeader } from "../DashboardHeader";

const DASHCARD = createMockDashboardCard();

export const TEST_DASHBOARD = createMockDashboard({
  dashcards: [DASHCARD],
});

export const TEST_DASHBOARD_WITH_TABS = createMockDashboard({
  tabs: [
    getDefaultTab({ tabId: 1, dashId: 1, name: "Tab 1" }),
    getDefaultTab({
      tabId: 2,
      dashId: 1,
      name: "Tab 2",
    }),
  ],
});

export const setup = async ({
  dashboard = TEST_DASHBOARD,
  isAdmin = false,
  email = false,
  slack = false,
  collections = [],
  enterprisePlugins,
  tokenFeatures = {},
}: {
  dashboard?: typeof TEST_DASHBOARD;
  isAdmin?: boolean;
  email?: boolean;
  slack?: boolean;
  collections?: Collection[];
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
  tokenFeatures?: Partial<TokenFeatures>;
}) => {
  setupCollectionsScenario({ collections });
  setupNotificationChannelsScenario({ email, slack });

  const builder = createScenario()
    .withDashboard(dashboard)
    .withUser({ is_superuser: isAdmin })
    .withDashboardReduxState();

  if (enterprisePlugins || Object.keys(tokenFeatures).length > 0) {
    builder.withEnterprise({
      plugins: enterprisePlugins,
      tokenFeatures,
    });
  }

  const { render } = builder.build();

  render(
    <Route
      path="*"
      component={() => (
        <MockDashboardContext
          dashboardId={dashboard.id}
          dashboard={dashboard}
          isFullscreen={false}
          isAdditionalInfoVisible={false}
          refreshPeriod={0}
          setRefreshElapsedHook={jest.fn()}
          onRefreshPeriodChange={jest.fn()}
          onFullscreenChange={jest.fn()}
          parameterQueryParams={{}}
          dashboardActions={DASHBOARD_APP_ACTIONS}
        >
          <DashboardHeader />
        </MockDashboardContext>
      )}
    />,
    { withRouter: true },
  );

  await waitForLoaderToBeRemoved();
};
