import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupNotificationChannelsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import type { Advisory } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createAdvisory } from "metabase-types/api/mocks/security-center";

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

  renderWithProviders(
    <Route path="*" element={<SecurityCenterPromoCard />} />,
    {
      initialRoute: "/",
      storeInitialState: state,
      withRouter: true,
    },
  );

  return { user: userEvent.setup({ advanceTimers: jest.advanceTimersByTime }) };
}

async function waitForRequests() {
  await act(async () => {
    await fetchMock.callHistory.flush(true);
    // RTK Query batches subscriber updates on a timer.
    await jest.runOnlyPendingTimersAsync();
  });
}

describe("SecurityCenterPromoCard", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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

    await waitForRequests();
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("does not render when slack is configured", async () => {
    setup({ slackConfigured: true });

    await waitForRequests();
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("does not render or fire admin-only requests for non-admin users", async () => {
    setup({ isAdmin: false });

    await waitForRequests();
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();

    expect(
      fetchMock.callHistory.calls("path:/api/ee/security-center"),
    ).toHaveLength(0);
    expect(
      fetchMock.callHistory.calls("path:/api/pulse/form_input"),
    ).toHaveLength(0);
  });

  it("does not render for non-pro-self-hosted plans", async () => {
    setup({ isProSelfHosted: false });

    await waitForRequests();
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("does not render when there is an active advisory (red banner takes over)", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "active" })],
    });

    await waitForRequests();
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });

  it("is dismissible", async () => {
    const { user } = setup();

    await screen.findByText(/Stay safe with security alerts/);
    const close = screen.getByRole("button", { name: /close/i });
    await user.click(close);

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

    await waitForRequests();
    expect(
      screen.queryByText(/Stay safe with security alerts/),
    ).not.toBeInTheDocument();
  });
});
