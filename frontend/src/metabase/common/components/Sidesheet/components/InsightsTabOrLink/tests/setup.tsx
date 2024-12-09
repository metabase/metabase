import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupAuditEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import { Tabs } from "metabase/ui";
import {
  createMockCollection,
  createMockDashboard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { InsightsTabOrLink } from "../InsightsTabOrLink";

export type SetupOpts = {
  isForADashboard?: boolean;
  enableAuditAppPlugin?: boolean;
  isUserAdmin?: boolean;
};

export const setup = async ({
  isForADashboard = false,
  enableAuditAppPlugin = false,
  isUserAdmin = false,
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

  setupAuditEndpoints();
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
        component={() => (
          <Tabs>
            <Tabs.List>
              {isForADashboard ? (
                <InsightsTabOrLink dashboard={mockDashboard} />
              ) : (
                <InsightsTabOrLink question={mockQuestion} />
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

  await waitForLoaderToBeRemoved();

  return utils;
};
