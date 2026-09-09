import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupBugReportingDetailsEndpoint,
  setupLlmProviderTypesEndpoint,
  setupLlmProvidersEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockAppState, createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import type { ChecklistItemValue } from "metabase/redux/store";
import { Route } from "metabase/router";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";

import { Onboarding } from "../Onboarding";

export type SetupProps = {
  isAdmin?: boolean;
  isAnalyst?: boolean;
  canWriteToCollections?: boolean;
  aiFeaturesEnabled?: boolean;
  openItem?: ChecklistItemValue;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
};

export const setup = ({
  isAdmin = true,
  isAnalyst = false,
  canWriteToCollections = true,
  aiFeaturesEnabled = true,
  openItem,
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupProps = {}) => {
  const hasTokenFeatures = Object.entries(tokenFeatures).length > 0;
  setupPropertiesEndpoints(createMockSettings());
  setupBugReportingDetailsEndpoint();
  // The AI item's "Connect to an AI provider" modal reads admin settings.
  setupSettingsEndpoints([]);
  setupLlmProvidersEndpoint();
  setupLlmProviderTypesEndpoint();
  const state = createMockState({
    app: createMockAppState({
      tempStorage: {
        "last-opened-onboarding-checklist-item": openItem,
      },
    }),
    currentUser: createMockUser({
      is_superuser: isAdmin,
      is_data_analyst: isAnalyst,
      can_write_any_collection: canWriteToCollections,
    }),
    settings: mockSettings({
      "ai-features-enabled?": aiFeaturesEnabled,
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

  // `store` lets a test assert on actions whose effect is rendered by the
  // app-level modal host, which lives outside this page's tree.
  const { store } = renderWithProviders(
    <Route path="/getting-started" element={<Onboarding />} />,
    {
      initialRoute: "/getting-started",
      storeInitialState: state,
      withRouter: true,
    },
  );

  return { store };
};
