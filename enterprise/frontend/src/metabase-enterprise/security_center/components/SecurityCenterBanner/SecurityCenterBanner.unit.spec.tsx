import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupNotificationChannelsEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { Advisory } from "../../types";

import { SecurityCenterBanner } from "./SecurityCenterBanner";

const DISMISSED_KEY = "security-center-banner-dismissed";

const makeAdvisory = (overrides: Partial<Advisory> = {}): Advisory => ({
  advisory_id: "SA-001",
  title: "Test advisory",
  description: "desc",
  severity: "medium",
  advisory_url: null,
  remediation: "Upgrade",
  published_at: "2026-01-01T00:00:00Z",
  match_status: "not_affected",
  last_evaluated_at: null,
  acknowledged_by: null,
  acknowledged_at: null,
  affected_versions: [{ min: "0.45.0", fixed: "0.59.0" }],
  ...overrides,
});

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
      await screen.findByText(/No notification channels are configured/),
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
      advisories: [makeAdvisory({ match_status: "active" })],
    });

    expect(
      await screen.findByText(/Active security advisories require attention/),
    ).toBeInTheDocument();
  });

  it("is dismissible when there are no active advisories", async () => {
    setup();

    await screen.findByTestId("app-banner");
    expect(screen.getByLabelText("close icon")).toBeInTheDocument();
  });

  it("is not dismissible when there are active advisories", async () => {
    setup({
      advisories: [makeAdvisory({ match_status: "active" })],
    });

    // Wait for the error banner text to confirm advisory data has loaded
    await screen.findByText(/Active security advisories require attention/);
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
      advisories: [makeAdvisory({ match_status: "active" })],
    });

    expect(
      await screen.findByText(/Active security advisories require attention/),
    ).toBeInTheDocument();
  });

  it("includes a link to security center settings", async () => {
    setup();

    const link = await screen.findByText("Set up notifications");
    expect(link).toHaveAttribute("href", "/admin/settings/security-center");
  });
});
