import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { PLUGIN_AUDIT } from "metabase/plugins";
import { Tabs } from "metabase/ui";
import type { CardId, CollectionId, DashboardId } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

interface AuditInfo {
  dashboard_overview: DashboardId;
  question_overview: CardId;
  custom_reports: CollectionId;
}

const defaultAuditInfo: AuditInfo = {
  dashboard_overview: 201,
  question_overview: 202,
  custom_reports: 203,
};

export const setup = ({
  isForADashboard,
  enableAuditAppPlugin,
  isUserAdmin,
}: {
  isForADashboard: boolean;
  enableAuditAppPlugin: boolean;
  isUserAdmin: boolean;
}) => {
  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: isUserAdmin }),
    entities: createMockEntitiesState({}),
    settings: mockSettings(
      createMockSettings({
        "token-features": createMockTokenFeatures({
          audit_app: enableAuditAppPlugin,
        }),
      }),
    ),
  });

  fetchMock.get("path:/api/ee/audit-app/user/audit-info", defaultAuditInfo);

  setupEnterprisePlugins();

  const mockDashboard = createMockDashboard();
  const mockQuestion = {
    id: () => 0,
    collection: () => createMockCollection(),
  };

  return renderWithProviders(
    <>
      <Route
        path="/"
        component={() => (
          <Tabs>
            <Tabs.List>
              {isForADashboard ? (
                <PLUGIN_AUDIT.InsightsTabOrLink dashboard={mockDashboard} />
              ) : (
                <PLUGIN_AUDIT.InsightsTabOrLink question={mockQuestion} />
              )}
            </Tabs.List>
          </Tabs>
        )}
      />
      <Route
        path="/dashboard/201"
        component={() => <div data-testid="usage-analytics-dashboard" />}
      />
      <Route
        path="/dashboard/202"
        component={() => <div data-testid="usage-analytics-dashboard" />}
      />
    </>,
    {
      initialRoute: "/",
      storeInitialState,
      withRouter: true,
    },
  );
};
