import { Route } from "react-router";

import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import { setupBugReportingDetailsEndpoint } from "__support__/server-mocks";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenStatus } from "metabase-types/api/mocks";

import { Onboarding } from "../Onboarding";
import type { ChecklistItemValue } from "../types";

export type SetupProps = {
  isAdmin?: boolean;
  applicationName?: string;
  enableXrays?: boolean;
  hasExampleDashboard?: boolean;
  isHosted?: boolean;
  openItem?: ChecklistItemValue;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
};

export const setup = ({
  isAdmin = true,
  applicationName,
  enableXrays = true,
  hasExampleDashboard = true,
  isHosted = false,
  openItem,
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupProps = {}) => {
  const hasTokenFeatures = Object.entries(tokenFeatures).length > 0;
  setupBugReportingDetailsEndpoint();

  const { render } = createScenario()
    .withUser({ is_superuser: isAdmin })
    .withSettings({
      "application-name": applicationName,
      "enable-xrays": enableXrays,
      "example-dashboard-id": hasExampleDashboard ? 1 : null,
      "is-hosted?": isHosted,
      "show-metabase-links": showMetabaseLinks,
      "token-status": hasTokenFeatures
        ? createMockTokenStatus({ valid: true })
        : null,
    })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(<Route path="/getting-started" component={Onboarding} />, {
    initialRoute: "/getting-started",
    withRouter: true,
    storeInitialState: {
      app: {
        tempStorage: {
          "last-opened-onboarding-checklist-item": openItem,
        },
      } as any,
    },
  });
};
