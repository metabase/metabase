import { Route } from "react-router";

import {
  setupBillingEndpoints,
  setupBugReportingDetailsEndpoint,
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { TransformsUpsellPage } from "./TransformsUpsellPage";

type SetupOpts = {
  hasBasicTransforms?: boolean;
  hadTransforms?: boolean;
  isHosted: boolean;
  isStoreUser: boolean;
  isOnTrial?: boolean;
};

export const setup = ({
  isHosted,
  isStoreUser,
  hasBasicTransforms,
  hadTransforms = false,
  isOnTrial = false,
}: SetupOpts) => {
  const currentUser = createMockUser({ is_superuser: isStoreUser });
  const settings = createMockSettings({
    "is-hosted?": isHosted,
    "token-status": {
      status: "valid",
      valid: true,
      "store-users": isStoreUser ? [{ email: currentUser.email }] : [],
      trial: isOnTrial,
    },
    "token-features": createMockTokenFeatures({
      "transforms-basic": !!hasBasicTransforms,
    }),
  });
  const state = createMockState({
    settings: createMockSettingsState(settings),
    currentUser,
  });
  setupBillingEndpoints({
    hasBasicTransformsAddOn: true,
    previousAddOns: hadTransforms
      ? [{ product_type: "transforms-basic-metered", self_service: true }]
      : [],
  });
  setupPropertiesEndpoints(settings);
  setupDatabaseListEndpoint([]);
  setupBugReportingDetailsEndpoint();

  renderWithProviders(
    <Route
      component={() => <TransformsUpsellPage />}
      path="/data-studio/transforms"
    />,
    {
      storeInitialState: state,
      withRouter: true,
      initialRoute: "/data-studio/transforms",
    },
  );
};

export const waitForLoadingToFinish = async () => {
  await waitFor(() => {
    expect(screen.queryByText(/Loading\.{3}/)).not.toBeInTheDocument();
  });
};
