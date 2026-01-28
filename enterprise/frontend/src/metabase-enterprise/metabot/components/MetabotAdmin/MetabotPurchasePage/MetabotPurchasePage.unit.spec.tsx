import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
  setupStoreEEBillingEndpoint,
  setupStoreEECloudAddOnsEndpoint,
  setupStoreEETieredMetabotAI,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { MetabotPurchasePage } from ".";

const nonStoreUserPageRegex = /Please ask a Metabase Store Admin/;
const storeUserTrialPageRegex =
  /After 14 days of free trial an additional amount/;
const storeUserNoTrialPageRegex = /An additional amount/;
const errorPageRegex = /Error fetching information/;
const expectNonStoreUserPage = async () => {
  expect(await screen.findByText(nonStoreUserPageRegex)).toBeVisible();
  expect(screen.queryByText(storeUserTrialPageRegex)).not.toBeInTheDocument();
  expect(screen.queryByText(storeUserNoTrialPageRegex)).not.toBeInTheDocument();
  expect(screen.queryByText(errorPageRegex)).not.toBeInTheDocument();
};

const expectStoreUserTrialPage = async () => {
  expect(screen.queryByText(nonStoreUserPageRegex)).not.toBeInTheDocument();
  expect(await screen.findByText(storeUserTrialPageRegex)).toBeVisible();
  expect(screen.queryByText(storeUserNoTrialPageRegex)).not.toBeInTheDocument();
  expect(screen.queryByText(errorPageRegex)).not.toBeInTheDocument();
};

const expectStoreUserNoTrialPage = async () => {
  expect(screen.queryByText(nonStoreUserPageRegex)).not.toBeInTheDocument();
  expect(screen.queryByText(storeUserTrialPageRegex)).not.toBeInTheDocument();
  expect(await screen.findByText(storeUserNoTrialPageRegex)).toBeVisible();
  expect(screen.queryByText(errorPageRegex)).not.toBeInTheDocument();
};

const expectErrorPage = async () => {
  expect(screen.queryByText(nonStoreUserPageRegex)).not.toBeInTheDocument();
  expect(screen.queryByText(storeUserTrialPageRegex)).not.toBeInTheDocument();
  expect(screen.queryByText(storeUserNoTrialPageRegex)).not.toBeInTheDocument();
  expect(await screen.findByText(errorPageRegex)).toBeVisible();
};

const setupRefreshableProperties = ({
  current_user_matches_store_user,
  has_metabot_v3 = false,
}: {
  current_user_matches_store_user: boolean;
  has_metabot_v3?: boolean;
}) => {
  const settings = createMockSettings({
    "token-status": {
      status: "",
      valid: true,
      features: has_metabot_v3 ? ["metabot-v3"] : [],
      "store-users": current_user_matches_store_user
        ? [{ email: "USER@example.com" }]
        : [],
    },
    "token-features": createMockTokenFeatures({ metabot_v3: has_metabot_v3 }),
  });
  setupPropertiesEndpoints(settings);
  return settings;
};

const setup = async ({
  current_user_matches_store_user,
  billing_period_months,
  had_metabot,
  simulate_http_get_error,
  simulate_http_post_error,
}: {
  current_user_matches_store_user: boolean;
  billing_period_months: number;
  had_metabot: false | "trial" | "tiered";
  simulate_http_get_error: boolean;
  simulate_http_post_error: false | "error-no-quantity" | "error-no-connection";
}) => {
  const settings = setupRefreshableProperties({
    current_user_matches_store_user,
  });

  const user = createMockUser({ email: "user@example.com" });
  setupCurrentUserEndpoint(user);

  setupStoreEEBillingEndpoint(
    billing_period_months,
    had_metabot,
    simulate_http_get_error,
  );
  setupStoreEECloudAddOnsEndpoint(
    billing_period_months,
    simulate_http_get_error,
  );
  setupStoreEETieredMetabotAI(simulate_http_post_error);

  renderWithProviders(<MetabotPurchasePage />, {
    // Calling `setupPropertiesEndpoints` above is not enough; we also need to set `storeInitialState`:
    storeInitialState: {
      settings: createMockSettingsState(settings),
      currentUser: user,
    },
  });

  await screen.findByText(/Metabot helps you move faster/);
};

describe("MetabotPurchasePage", () => {
  it("shows empty state alternate text when current user is not a store user", async () => {
    await setup({
      current_user_matches_store_user: false,
      billing_period_months: 12,
      had_metabot: false,
      simulate_http_get_error: false,
      simulate_http_post_error: false,
    });

    await expectNonStoreUserPage();
  });

  it("shows an error message when retrieving billing or add-on information fails", async () => {
    await setup({
      current_user_matches_store_user: true,
      billing_period_months: 12,
      had_metabot: false,
      simulate_http_get_error: true,
      simulate_http_post_error: false,
    });

    await expectErrorPage();
  });

  it("does not show an error message when when current user is not a store user", async () => {
    await setup({
      current_user_matches_store_user: false,
      billing_period_months: 12,
      had_metabot: false,
      simulate_http_get_error: true,
      simulate_http_post_error: false,
    });

    await expectNonStoreUserPage();
  });

  it("does not show trial page when metabot was trialed previously", async () => {
    await setup({
      current_user_matches_store_user: true,
      billing_period_months: 1,
      had_metabot: "trial",
      simulate_http_get_error: false,
      simulate_http_post_error: false,
    });

    await expectStoreUserNoTrialPage();
  });

  it("does not show trial page when metabot was purchased previously", async () => {
    await setup({
      current_user_matches_store_user: true,
      billing_period_months: 1,
      had_metabot: "tiered",
      simulate_http_get_error: false,
      simulate_http_post_error: false,
    });

    await expectStoreUserNoTrialPage();
  });

  it("shows monthly tiers according to own billing period", async () => {
    await setup({
      current_user_matches_store_user: true,
      billing_period_months: 1,
      had_metabot: false,
      simulate_http_get_error: false,
      simulate_http_post_error: false,
    });

    await expectStoreUserTrialPage();

    const metabase_ai_tier1 = screen.getByRole("radio", {
      name: /up to 1234 requests\/month/,
    });
    expect(metabase_ai_tier1).toBeVisible();
    expect(metabase_ai_tier1).toHaveAccessibleName(/\$111\/month/);
    const metabase_ai_tier2 = screen.getByRole("radio", {
      name: /up to 2345 requests\/month/,
    });
    expect(metabase_ai_tier2).toBeVisible();
    expect(metabase_ai_tier2).toHaveAccessibleName(/\$222\/month/);
  });

  it("shows yearly tiers according to own billing period", async () => {
    await setup({
      current_user_matches_store_user: true,
      billing_period_months: 12,
      had_metabot: false,
      simulate_http_get_error: false,
      simulate_http_post_error: false,
    });

    await expectStoreUserTrialPage();

    const metabase_ai_tier3 = screen.getByRole("radio", {
      name: /up to 3456 requests\/year/,
    });
    expect(metabase_ai_tier3).toBeVisible();
    expect(metabase_ai_tier3).toHaveAccessibleName(/\$333\/year/);
    const metabase_ai_tier4 = screen.getByRole("radio", {
      name: /up to 4567 requests\/year/,
    });
    expect(metabase_ai_tier4).toBeVisible();
    expect(metabase_ai_tier4).toHaveAccessibleName(/\$444\/year/);
  });

  it("requires Terms of Service to be accepted", async () => {
    await setup({
      current_user_matches_store_user: true,
      billing_period_months: 12,
      had_metabot: false,
      simulate_http_get_error: false,
      simulate_http_post_error: false,
    });

    await expectStoreUserTrialPage();

    // This add-on product tier has `is_default = true`:
    expect(
      screen.getByRole("radio", { name: /up to 4567 requests/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /Confirm purchase/ }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    );

    expect(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: /Confirm purchase/ }),
    ).toBeEnabled();

    await userEvent.click(
      screen.getByRole("button", { name: /Confirm purchase/ }),
    );
    expect(screen.getByRole("button", { name: /Success/ })).toBeVisible();

    expect(
      await screen.findByText(/Setting up Metabot AI, please wait/),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Done/ }),
    ).not.toBeInTheDocument();

    const postRequests = await findRequests("POST");
    const cloudAddOnsRequest = postRequests.find(({ url }) =>
      /\/api\/ee\/cloud-add-ons\/metabase-ai-tiered$/.test(url),
    );
    expect(cloudAddOnsRequest).toBeTruthy();
    expect("terms_of_service" in cloudAddOnsRequest!.body).toBeTruthy();
    expect(cloudAddOnsRequest!.body.quantity).toEqual(4567);
    expect(cloudAddOnsRequest!.body.terms_of_service).toEqual(true);

    setupRefreshableProperties({
      current_user_matches_store_user: true,
      has_metabot_v3: true,
    });
    expect(await screen.findByText(/Metabot AI is ready/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Done/ })).toBeEnabled();
  });

  it("can change requested quantity", async () => {
    await setup({
      current_user_matches_store_user: true,
      billing_period_months: 12,
      had_metabot: false,
      simulate_http_get_error: false,
      simulate_http_post_error: false,
    });

    await expectStoreUserTrialPage();

    await userEvent.click(
      screen.getByRole("radio", { name: /up to 3456 requests/ }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Confirm purchase/ }),
    );
    expect(
      await screen.findByText(/Setting up Metabot AI, please wait/),
    ).toBeVisible();

    const postRequests = await findRequests("POST");
    const cloudAddOnsRequest = postRequests.find(({ url }) =>
      /\/api\/ee\/cloud-add-ons\/metabase-ai-tiered$/.test(url),
    );
    expect(cloudAddOnsRequest).toBeTruthy();
    expect("terms_of_service" in cloudAddOnsRequest!.body).toBeTruthy();
    expect(cloudAddOnsRequest!.body.quantity).toEqual(3456);
  });

  it("reports validation errors", async () => {
    await setup({
      current_user_matches_store_user: true,
      billing_period_months: 12,
      had_metabot: false,
      simulate_http_get_error: false,
      simulate_http_post_error: "error-no-quantity",
    });

    await expectStoreUserTrialPage();

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Confirm purchase/ }),
    );
    expect(
      await screen.findByText(/Failed to purchase Metabot AI/),
    ).toBeVisible();

    const postRequests = await findRequests("POST");
    const cloudAddOnsRequest = postRequests.find(({ url }) =>
      /\/api\/ee\/cloud-add-ons\/metabase-ai-tiered$/.test(url),
    );
    expect(cloudAddOnsRequest).toBeTruthy();
  });

  it("reports other errors", async () => {
    await setup({
      current_user_matches_store_user: true,
      billing_period_months: 12,
      had_metabot: false,
      simulate_http_get_error: false,
      simulate_http_post_error: "error-no-connection",
    });

    await expectStoreUserTrialPage();

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Confirm purchase/ }),
    );
    expect(
      await screen.findByText(/Failed to purchase Metabot AI/),
    ).toBeVisible();

    const postRequests = await findRequests("POST");
    const cloudAddOnsRequest = postRequests.find(({ url }) =>
      /\/api\/ee\/cloud-add-ons\/metabase-ai-tiered$/.test(url),
    );
    expect(cloudAddOnsRequest).toBeTruthy();
  });
});
