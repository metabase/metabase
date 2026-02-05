import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
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
};

export const transformsAddOnPrice = 100;
export const transformsPlusPyAddOnPrice = 250;

export const setup = ({
  isHosted,
  isStoreUser,
  hasBasicTransforms,
}: SetupOpts) => {
  const user = createMockUser();
  const settings = createMockSettings({
    "is-hosted?": isHosted,
    "token-status": {
      status: "valid",
      valid: true,
      "store-users": isStoreUser ? [{ email: user.email }] : [],
    },
    "token-features": createMockTokenFeatures({
      transforms: !!hasBasicTransforms,
    }),
  });
  const state = createMockState({
    settings: createMockSettingsState(settings),
    currentUser: createMockUser(),
  });
  setupBillingEndpoints();
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

const setupBillingEndpoints = () => {
  fetchMock
    .get("path:/api/ee/cloud-add-ons/addons", [
      {
        id: 1,
        name: "Transforms (basic)",
        short_name: "Transforms",
        description: null,
        active: true,
        self_service: true,
        deployment: "cloud",
        billing_period_months: 12,
        default_base_fee: transformsAddOnPrice,
        default_included_units: 0,
        default_prepaid_units: 0,
        default_price_per_unit: 0,
        default_total_units: 0,
        is_metered: false,
        product_type: "transforms-basic",
        token_features: [],
        trial_days: null,
        product_tiers: [],
      },
      {
        id: 2,
        name: "Transforms (advanced)",
        short_name: "Transforms + Python",
        description: null,
        active: true,
        self_service: true,
        deployment: "cloud",
        billing_period_months: 12,
        default_base_fee: transformsPlusPyAddOnPrice,
        default_included_units: 0,
        default_prepaid_units: 0,
        default_price_per_unit: 0,
        default_total_units: 0,
        is_metered: false,
        product_type: "transforms-advanced",
        token_features: [],
        trial_days: null,
        product_tiers: [],
      },
    ])
    .get("path:/api/ee/billing", {
      version: "0",
      data: {
        billing_period_months: 12,
        previous_add_ons: [],
      },
    });
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
