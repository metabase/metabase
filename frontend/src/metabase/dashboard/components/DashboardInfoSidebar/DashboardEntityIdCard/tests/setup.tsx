import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import type { RenderWithProvidersOptions } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";

import { DashboardEntityIdCard } from "../DashboardEntityIdCard";

export const setup = ({
  dashboard = createMockDashboard(),
  enterprisePlugins,
  enableSerialization = false,
  ...renderOptions
}: {
  dashboard?: Dashboard;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
  enableSerialization?: boolean;
} & RenderWithProvidersOptions = {}) => {
  const { render } = createScenario()
    .withEnterprise({
      plugins: enterprisePlugins,
      tokenFeatures: { serialization: enableSerialization },
    })
    .build();

  return render(<DashboardEntityIdCard dashboard={dashboard} />, renderOptions);
};
