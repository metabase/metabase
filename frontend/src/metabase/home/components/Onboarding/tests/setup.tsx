import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupBugReportingDetailsEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockAppState,
  createMockState,
} from "metabase-types/store/mocks";

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
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
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
  setupPropertiesEndpoints(createMockSettings());
  setupBugReportingDetailsEndpoint();
  const state = createMockState({
    app: createMockAppState({
      tempStorage: {
        "last-opened-onboarding-checklist-item": openItem,
      },
    }),
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "application-name": applicationName,
      "enable-xrays": enableXrays,
      "example-dashboard-id": hasExampleDashboard ? 1 : null,
      "is-hosted?": isHosted,
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
      "token-status": hasTokenFeatures
        ? createMockTokenStatus({ valid: true })
        : null,
    }),
  });

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  renderWithProviders(
    <Route path="/getting-started" component={Onboarding} />,
    {
      initialRoute: "/getting-started",
      storeInitialState: state,
      withRouter: true,
    },
  );
};
