import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupAuditInfoEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { Tabs } from "metabase/ui";
import {
  createMockCollection,
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { InsightsTabOrLink } from "../InsightsTabOrLink";

export type SetupOpts = {
  isForADashboard?: boolean;
  enableAuditAppPlugin?: boolean;
  isUserAdmin?: boolean;
  hasUsageAnalyticsPermission?: boolean;
};

export const setup = async ({
  isForADashboard = false,
  enableAuditAppPlugin = false,
  isUserAdmin = false,
  hasUsageAnalyticsPermission = true,
}: SetupOpts = {}) => {
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

  if (hasUsageAnalyticsPermission) {
    setupAuditInfoEndpoint();
  } else {
    setupAuditInfoEndpoint({ auditInfo: {} });
  }
  setupEnterprisePlugins();

  const mockDashboard = createMockDashboard();
  const mockQuestion = {
    id: () => 0,
    collection: () => createMockCollection(),
  };

  const utils = renderWithProviders(
    <>
      <Route
        path="/"
        element={
          <Tabs>
            <Tabs.List>
              {isForADashboard ? (
                <InsightsTabOrLink dashboard={mockDashboard} />
              ) : (
                <InsightsTabOrLink question={mockQuestion} />
              )}
            </Tabs.List>
          </Tabs>
        }
      />
      <Route
        path="/dashboard/201"
        element={<div data-testid="usage-analytics-dashboard" />}
      />
      <Route
        path="/dashboard/202"
        element={<div data-testid="usage-analytics-dashboard" />}
      />
    </>,
    {
      initialRoute: "/",
      storeInitialState,
      withRouter: true,
    },
  );

  await waitForLoaderToBeRemoved();

  return utils;
};
