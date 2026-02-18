import { Route } from "react-router";

import {
  setupBillingEndpoints,
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
  isOnTrial = false,
  trialDays,
}: SetupOpts) => {
  const user = createMockUser();
  const settings = createMockSettings({
    "is-hosted?": isHosted,
    "token-status": {
      status: "valid",
      valid: true,
      "store-users": isStoreUser ? [{ email: user.email }] : [],
      trial: isOnTrial,
    },
    "token-features": createMockTokenFeatures({
      transforms: !!hasBasicTransforms,
    }),
  });
  const state = createMockState({
    settings: createMockSettingsState(settings),
    currentUser: createMockUser(),
  });
  setupBillingEndpoints({
    transformsAdvancedPrice,
    transformsBasicPrice,
    trialDays,
  });
  setupPropertiesEndpoints(settings);

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

export const assertLeftColumnContent = () => {
  expect(
    screen.getByRole("heading", {
      name: /Start transforming your data in Metabase/,
    }),
  );
  expect(
    screen.getByText(/Schedule and run transforms as groups with jobs/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      /Fast runs with incremental transforms that respond to data changes/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      /Predictable costs - 72,000 successful transform runs included every month/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      /If you go over your cap, transforms bill at 0.01 per transform run/,
    ),
  ).toBeInTheDocument();
};

export const waitForLoadingToFinish = async () => {
  await waitFor(() => {
    expect(screen.queryByText(/Loading\.{3}/)).not.toBeInTheDocument();
  });
};
