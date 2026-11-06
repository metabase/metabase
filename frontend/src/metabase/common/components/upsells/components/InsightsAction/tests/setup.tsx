import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAuditInfoEndpoint,
  setupTokenStatusEndpointEmpty,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { Route } from "metabase/router";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { InsightsAction } from "../InsightsAction";

export const USAGE_ANALYTICS_DASHBOARD_TEST_ID = "usage-analytics-dashboard";

export type SetupOpts = {
  isForADashboard?: boolean;
  enableAuditAppPlugin?: boolean;
  isUserAdmin?: boolean;
  hasUsageAnalyticsPermission?: boolean;
  collection?: Collection;
};

export const setup = async ({
  isForADashboard = false,
  enableAuditAppPlugin = false,
  isUserAdmin = false,
  hasUsageAnalyticsPermission = true,
  collection = createMockCollection(),
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

  setupAuditInfoEndpoint(
    hasUsageAnalyticsPermission ? undefined : { auditInfo: {} },
  );
  setupTokenStatusEndpointEmpty();
  setupEnterprisePlugins();

  const dashboard = createMockDashboard({ collection });
  const question = {
    id: () => 0,
    collection: () => collection,
  };

  const utils = renderWithProviders(
    <>
      <Route
        path="/"
        element={
          isForADashboard ? (
            <InsightsAction dashboard={dashboard} entityType="dashboard" />
          ) : (
            <InsightsAction question={question} entityType="question" />
          )
        }
      />
      <Route
        path="/dashboard/201"
        element={<div data-testid={USAGE_ANALYTICS_DASHBOARD_TEST_ID} />}
      />
      <Route
        path="/dashboard/202"
        element={<div data-testid={USAGE_ANALYTICS_DASHBOARD_TEST_ID} />}
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
