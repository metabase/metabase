import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupNotificationChannelsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { SecurityCenterPromoCard } from "./SecurityCenterPromoCard";

const DISMISSED_KEY = "security-center-promo-dismissed";

interface SetupOpts {
  isAdmin?: boolean;
  emailConfigured?: boolean;
  slackConfigured?: boolean;
}

function setup({
  isAdmin = true,
  emailConfigured = false,
  slackConfigured = false,
}: SetupOpts = {}) {
  const tokenFeatures = createMockTokenFeatures({
    advanced_permissions: true,
    hosting: false,
  });

  setupNotificationChannelsEndpoints({
    email: { configured: emailConfigured },
    slack: { configured: slackConfigured },
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
    ).toHaveAttribute(
      "href",
      "/admin/security-center/advisories?open=notifications",
    );
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
      fetchMock.callHistory.calls("path:/api/ee/security-center/advisories"),
    ).toHaveLength(0);
    expect(
      fetchMock.callHistory.calls("path:/api/pulse/form_input"),
    ).toHaveLength(0);
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
