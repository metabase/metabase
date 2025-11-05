import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { MetabotPurchasePage } from "./MetabotPurchasePage";

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
}: {
  current_user_matches_store_user: boolean;
}) => {
  const settings = setupRefreshableProperties({
    current_user_matches_store_user,
  });

  const user = createMockUser({ email: "user@example.com" });
  setupCurrentUserEndpoint(user);

  fetchMock.post("path:/api/ee/cloud-add-ons/metabase-ai", 200);

  renderWithProviders(<MetabotPurchasePage />, {
    // Calling `setupPropertiesEndpoints` above is not enough; we also need to set `storeInitialState`:
    storeInitialState: {
      settings: createMockSettingsState(settings),
      currentUser: user,
    },
  });

  await screen.findByText(/Get a free month of Metabot/);
};

describe("MetabotPurchasePage", () => {
  it("shows empty state alternate text when current user is not a store user", async () => {
    await setup({ current_user_matches_store_user: false });
    expect(screen.getByText(/Get a free month of Metabot/)).toBeInTheDocument();
    expect(
      screen.getByText(/Please ask a Metabase Store Admin/),
    ).toBeInTheDocument();
  });

  it("requires Terms of Service to be accepted", async () => {
    await setup({
      current_user_matches_store_user: true,
    });
    expect(
      screen.queryByText(/Please ask a Metabase Store Admin/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /Add Metabot AI/ }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    );
    expect(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: /Add Metabot AI/ }),
    ).toBeEnabled();
  });

  it("submits a HTTP request", async () => {
    await setup({
      current_user_matches_store_user: true,
    });
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Terms of Service/ }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Add Metabot AI/ }),
    );
    expect(screen.getByRole("button", { name: /Success/ })).toBeInTheDocument();

    expect(
      await screen.findByText(/Setting up Metabot AI, please wait/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Done/ })).toBeDisabled();

    const postRequests = await findRequests("POST");
    const cloudAddOnsRequest = postRequests.find(({ url }) =>
      /\/api\/ee\/cloud-add-ons\/metabase-ai$/.test(url),
    );
    expect(cloudAddOnsRequest).toBeTruthy();
    expect("terms_of_service" in cloudAddOnsRequest?.body).toBeTruthy();
    expect(cloudAddOnsRequest?.body?.terms_of_service).toEqual(true);

    setupRefreshableProperties({
      current_user_matches_store_user: true,
      has_metabot_v3: true,
    });
    expect(await screen.findByText(/Metabot AI is ready/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Done/ })).toBeEnabled();
  });
});
