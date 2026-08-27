import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupNotificationChannelsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { subscriptionApi } from "metabase/api";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type { Advisory } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createAdvisory } from "metabase-types/api/mocks/security-center";

import { securityCenterApi } from "../../api";

import { SecurityCenterPromoCard } from "./SecurityCenterPromoCard";

const DISMISSED_KEY = "security-center-promo-dismissed";

interface SetupOpts {
  isAdmin?: boolean;
  isProSelfHosted?: boolean;
  emailConfigured?: boolean;
  slackConfigured?: boolean;
  advisories?: Advisory[];
}

function setup({
  isAdmin = true,
  isProSelfHosted = true,
  emailConfigured = false,
  slackConfigured = false,
  advisories = [],
}: SetupOpts = {}) {
  const tokenFeatures = createMockTokenFeatures(
    isProSelfHosted
      ? { advanced_permissions: true, hosting: false }
      : { hosting: false },
  );

  setupNotificationChannelsEndpoints({
    email: { configured: emailConfigured },
    slack: { configured: slackConfigured },
  });

  fetchMock.get("path:/api/ee/security-center", {
    last_checked_at: null,
    advisories,
  });

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "token-features": tokenFeatures,
    }),
  });

  return renderWithProviders(
    <Route path="*" element={<SecurityCenterPromoCard />} />,
    {
      initialRoute: "/",
      storeInitialState: state,
      withRouter: true,
    },
  );
}

type SetupResult = ReturnType<typeof setup>;

type EnterpriseApiState = Parameters<
  ReturnType<typeof securityCenterApi.endpoints.listSecurityAdvisories.select>
>[0];

function selectListSecurityAdvisories({ store }: SetupResult) {
  return securityCenterApi.endpoints.listSecurityAdvisories.select()(
    // The EnterpriseApi selectors are typed against the enterprise tag union,
    // while the test store is typed with the OSS State.
    // The runtime state shape is the same.
    store.getState() as unknown as EnterpriseApiState,
  );
}

async function waitForAdminQueriesToFinish(result: SetupResult) {
  const { store } = result;
  await waitFor(() => {
    expect(
      subscriptionApi.endpoints.getChannelInfo.select()(store.getState())
        .isSuccess,
    ).toBe(true);
    expect(selectListSecurityAdvisories(result).isSuccess).toBe(true);
  });
}

function expectAdminQueriesToBeSkipped(result: SetupResult) {
  const { store } = result;
  expect(
    subscriptionApi.endpoints.getChannelInfo.select()(store.getState())
      .isUninitialized,
  ).toBe(true);
  expect(selectListSecurityAdvisories(result).isUninitialized).toBe(true);
}

describe("SecurityCenterPromoCard", () => {
  afterEach(() => {
    localStorage.removeItem(DISMISSED_KEY);
  });

  it("renders the promo when no channels are configured and no active advisory", async () => {
    setup();

    expect(
      await screen.findByText(/Stay safe with security alerts/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Set up security alerts/i }),
    ).toHaveAttribute("href", "/admin/security-center?open=notifications");
  });

  it("does not render when email is configured", async () => {
    const view = setup({ emailConfigured: true });

    await waitForAdminQueriesToFinish(view);
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("does not render when slack is configured", async () => {
    const view = setup({ slackConfigured: true });

    await waitForAdminQueriesToFinish(view);
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("does not render or fire admin-only requests for non-admin users", () => {
    const view = setup({ isAdmin: false });

    expectAdminQueriesToBeSkipped(view);
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();

    // Non-admins must not trigger admin-only endpoints.
    expect(fetchMock.callHistory.called("path:/api/ee/security-center")).toBe(
      false,
    );
  });

  it("does not render for non-pro-self-hosted plans", async () => {
    const view = setup({ isProSelfHosted: false });

    await waitForAdminQueriesToFinish(view);
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("does not render when there is an active advisory (red banner takes over)", async () => {
    const view = setup({
      advisories: [createAdvisory({ match_status: "active" })],
    });

    await waitForAdminQueriesToFinish(view);
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("is dismissible", async () => {
    setup();

    await screen.findByText(/Stay safe with security alerts/);
    const close = screen.getByRole("button", { name: /close/i });
    await userEvent.click(close);

    await waitFor(() => {
      expect(
        screen.queryByText(/Stay safe with security alerts/),
      ).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(DISMISSED_KEY)).toBe("true");
  });

  it("stays hidden after dismissal", async () => {
    localStorage.setItem(DISMISSED_KEY, "true");

    const view = setup();

    await waitForAdminQueriesToFinish(view);
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });
});
