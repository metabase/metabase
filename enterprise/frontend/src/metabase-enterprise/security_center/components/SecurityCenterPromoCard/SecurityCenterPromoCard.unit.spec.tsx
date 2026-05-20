import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupNotificationChannelsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Advisory } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createAdvisory } from "metabase-types/api/mocks/security-center";

import { SecurityCenterPromoCard } from "./SecurityCenterPromoCard";

const DISMISSED_KEY = "security-center-promo-dismissed";

interface SetupOpts {
  isProSelfHosted?: boolean;
  emailConfigured?: boolean;
  slackConfigured?: boolean;
  advisories?: Advisory[];
}

function setup({
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
    email: { configured: emailConfigured } as any,
    slack: { configured: slackConfigured } as any,
  });

  fetchMock.get("path:/api/ee/security-center", {
    last_checked_at: null,
    advisories,
  });

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "token-features": tokenFeatures,
    }),
  });

  renderWithProviders(<Route path="*" component={SecurityCenterPromoCard} />, {
    initialRoute: "/",
    storeInitialState: state,
    withRouter: true,
  });
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
    setup({ emailConfigured: true });

    await screen.findByText(() => false).catch(() => {});
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("does not render when slack is configured", async () => {
    setup({ slackConfigured: true });

    await screen.findByText(() => false).catch(() => {});
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("does not render for non-pro-self-hosted plans", async () => {
    setup({ isProSelfHosted: false });

    await screen.findByText(() => false).catch(() => {});
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("does not render when there is an active advisory (red banner takes over)", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "active" })],
    });

    await screen.findByText(() => false).catch(() => {});
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("is dismissible", async () => {
    setup();

    await screen.findByText(/Stay safe with security alerts/);
    const close = screen.getByRole("button", { name: /close/i });
    close.click();

    await waitFor(() => {
      expect(
        screen.queryByText(/Stay safe with security alerts/),
      ).not.toBeInTheDocument();
    });
    expect(localStorage.getItem(DISMISSED_KEY)).toBe("true");
  });

  it("stays hidden after dismissal", async () => {
    localStorage.setItem(DISMISSED_KEY, "true");

    setup();

    await screen.findByText(() => false).catch(() => {});
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });
});
