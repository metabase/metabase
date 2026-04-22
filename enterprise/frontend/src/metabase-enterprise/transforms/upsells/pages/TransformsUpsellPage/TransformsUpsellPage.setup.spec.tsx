import { Route } from "react-router";

import {
  setupBillingEndpoints,
  setupBugReportingDetailsEndpoint,
  setupDatabaseListEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { TransformsUpsellPage } from "./TransformsUpsellPage";

type SetupOpts = {
  hasBasicTransforms?: boolean;
  hadTransforms?: boolean;
  isHosted: boolean;
  isStoreUser: boolean;
  isOnTrial?: boolean;
  trialDays?: number;
};

export const transformsBasicPrice = 100;
export const transformsAdvancedPrice = 250;

export const setup = ({
  isHosted,
  isStoreUser,
  hasBasicTransforms,
  hadTransforms = false,
  isOnTrial = false,
  trialDays,
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
    transformsAdvancedPrice,
    transformsBasicPrice,
    trialDays,
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
