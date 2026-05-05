import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupNotificationChannelsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { Advisory } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createAdvisory } from "metabase-types/api/mocks/security-center";
import { createMockState } from "metabase-types/store/mocks";

import { SecurityCenterBanner } from "./SecurityCenterBanner";

const DISMISSED_KEY = "security-center-banner-dismissed";

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

  renderWithProviders(<Route path="*" component={SecurityCenterBanner} />, {
    initialRoute: "/",
    storeInitialState: state,
    withRouter: true,
  });
}

describe("SecurityCenterBanner", () => {
  afterEach(() => {
    localStorage.removeItem(DISMISSED_KEY);
  });

  it("renders warning banner when no channels are configured", async () => {
    setup();

    expect(
      await screen.findByText(/Please configure notification channels/),
    ).toBeInTheDocument();
  });

  it("does not render when email is configured", async () => {
    setup({ emailConfigured: true });

    // Wait for API responses to settle, then assert no banner
    await screen.findByText(() => false).catch(() => {});
    expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
  });

  it("does not render when slack is configured", async () => {
    setup({ slackConfigured: true });

    await screen.findByText(() => false).catch(() => {});
    expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
  });

  it("does not render for non-pro-self-hosted plans", async () => {
    setup({ isProSelfHosted: false });

    await screen.findByText(() => false).catch(() => {});
    expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
  });

  it("renders error banner with active advisories", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "active" })],
    });

    expect(
      await screen.findByText(/Please configure notification channels/),
    ).toBeInTheDocument();
  });

  it("is dismissible when there are no active advisories", async () => {
    setup();

    await screen.findByTestId("app-banner");
    expect(screen.getByLabelText("close icon")).toBeInTheDocument();
  });

  it("is not dismissible when there are active advisories", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "active" })],
    });

    // Wait for the error banner text to confirm advisory data has loaded
    await screen.findByText(/Please configure notification channels/);
    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
  });

  it("stays hidden after dismissal when there are no active advisories", async () => {
    localStorage.setItem(DISMISSED_KEY, "true");

    setup();

    await screen.findByText(() => false).catch(() => {});
    expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
  });

  it("shows banner despite dismissal when there are active advisories", async () => {
    localStorage.setItem(DISMISSED_KEY, "true");

    setup({
      advisories: [createAdvisory({ match_status: "active" })],
    });

    expect(
      await screen.findByText(/Please configure notification channels/),
    ).toBeInTheDocument();
  });

  it("includes a link to security center notification settings", async () => {
    setup();

    const link = await screen.findByText("Security center");
    expect(link).toHaveAttribute(
      "href",
      "/admin/security-center?open=notifications",
    );
  });
});
