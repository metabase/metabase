import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import {
  type RenderWithProvidersOptions,
  renderWithProviders,
} from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import {
  createMockDashboard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DashboardEntityIdCard } from "../DashboardEntityIdCard";

export const setup = ({
  dashboard = createMockDashboard(),
  enterprisePlugins,
  enableSerialization = false,
  ...renderOptions
}: {
  dashboard?: Dashboard;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  enableSerialization?: boolean;
} & RenderWithProvidersOptions = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        serialization: enableSerialization,
      }),
    }),
  });
  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }
  return renderWithProviders(<DashboardEntityIdCard dashboard={dashboard} />, {
    ...renderOptions,
    storeInitialState: state,
  });
};
