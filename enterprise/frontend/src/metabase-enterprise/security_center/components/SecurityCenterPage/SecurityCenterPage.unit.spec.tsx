import userEvent from "@testing-library/user-event";

import { setupRecentViewsAndSelectionsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";

import * as notificationHook from "../../hooks/use-notification-config";
import * as advisoriesHook from "../../hooks/use-security-advisories";
import type { Advisory } from "../../types";

import { SecurityCenterPage } from "./SecurityCenterPage";

const makeAdvisory = (overrides: Partial<Advisory>): Advisory => ({
  advisory_id: "SA-001",
  title: "Test advisory",
  description: "Test description",
  severity: "medium",
  advisory_url: "https://example.com/advisory",
  remediation: "Upgrade to latest version",
  published_at: "2026-01-01T00:00:00Z",
  match_status: "not_affected",
  last_evaluated_at: null,
  acknowledged_by: null,
  acknowledged_at: null,
  affected_versions: [{ min: "0.45.0", fixed: "0.59.0" }],
  ...overrides,
});

const mockAcknowledge = jest.fn();

function setup(advisories: Advisory[] = []) {
  jest.spyOn(advisoriesHook, "useSecurityAdvisories").mockReturnValue({
    data: advisories,
    lastCheckedAt: null,
    isLoading: false,
    acknowledgeAdvisory: mockAcknowledge,
  });

  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  jest.spyOn(notificationHook, "useNotificationConfig").mockReturnValue({
    config: {
      email: { sendToAllAdmins: true, recipients: [] },
      slack: { enabled: false, channel: "" },
    },
    users: [],
    slackChannelOptions: [],
    updateEmailRecipients: jest.fn(),
    toggleSendToAllAdmins: jest.fn(),
    updateSlackChannel: jest.fn(),
    toggleSlack: jest.fn(),
    save: jest.fn(),
    sendTestEmail: jest.fn(),
    sendTestSlack: jest.fn(),
  });

  renderWithProviders(<SecurityCenterPage />);
}

describe("SecurityCenterPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockAcknowledge.mockClear();
  });

  it("renders the title and current version", () => {
    setup();

    expect(screen.getByText("Security Center")).toBeInTheDocument();
    expect(screen.getByTestId("current-version")).toHaveTextContent("v0.59.3");
  });

  it("renders the empty state when there are no advisories", () => {
    setup([]);

    expect(screen.getByText(/Your instance is up to date/)).toBeInTheDocument();
  });

  it("renders advisory cards in the correct order (affected first, then by severity)", () => {
    const advisories = [
      makeAdvisory({
        advisory_id: "1",
        title: "Low not affected",
        severity: "low",
        match_status: "not_affected",
      }),
      makeAdvisory({
        advisory_id: "2",
        title: "Critical affected",
        severity: "critical",
        match_status: "active",
      }),
      makeAdvisory({
        advisory_id: "3",
        title: "High affected",
        severity: "high",
        match_status: "active",
      }),
    ];

    setup(advisories);

    const cards = screen.getAllByTestId("advisory-card");
    expect(cards).toHaveLength(3);

    expect(within(cards[0]).getByText("Critical affected")).toBeInTheDocument();
    expect(within(cards[1]).getByText("High affected")).toBeInTheDocument();
    expect(within(cards[2]).getByText("Low not affected")).toBeInTheDocument();
  });

  it("shows affected status on cards", () => {
    const advisories = [
      makeAdvisory({ advisory_id: "1", match_status: "active" }),
      makeAdvisory({ advisory_id: "2", match_status: "not_affected" }),
    ];

    setup(advisories);

    const statuses = screen.getAllByTestId("affected-status");
    expect(statuses[0]).toHaveTextContent("Affected");
    expect(statuses[1]).toHaveTextContent("Not affected");
  });

  it("renders external links with correct targets", () => {
    const advisories = [
      makeAdvisory({
        advisory_id: "1",
        advisory_url: "https://example.com/advisory/1",
      }),
    ];

    setup(advisories);

    const advisoryLink = screen.getByText("View advisory");
    expect(advisoryLink).toHaveAttribute(
      "href",
      "https://example.com/advisory/1",
    );
    expect(advisoryLink).toHaveAttribute("target", "_blank");
  });

  it("calls acknowledgeAdvisory when acknowledge button is clicked", async () => {
    const advisories = [
      makeAdvisory({ advisory_id: "SA-001", acknowledged_at: null }),
    ];

    setup(advisories);

    await userEvent.click(screen.getByTestId("acknowledge-button"));
    expect(mockAcknowledge).toHaveBeenCalledWith("SA-001");
  });

  it("does not show acknowledge button for already acknowledged advisories", async () => {
    const advisories = [
      makeAdvisory({
        advisory_id: "SA-001",
        acknowledged_at: "2026-03-01T00:00:00Z",
      }),
    ];

    setup(advisories);

    // Acknowledged advisories are hidden by default — enable the checkbox first
    await userEvent.click(screen.getByTestId("show-acknowledged-filter"));

    expect(screen.queryByTestId("acknowledge-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("acknowledged-badge")).toHaveTextContent(
      "Acknowledged",
    );
  });

  it("hides acknowledged advisories by default", () => {
    const advisories = [
      makeAdvisory({
        advisory_id: "1",
        title: "Visible",
        acknowledged_at: null,
      }),
      makeAdvisory({
        advisory_id: "2",
        title: "Hidden",
        acknowledged_at: "2026-03-01T00:00:00Z",
      }),
    ];

    setup(advisories);

    expect(screen.getByText("Visible")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("renders the filter bar", () => {
    setup([]);

    expect(screen.getByTestId("advisory-filter-bar")).toBeInTheDocument();
  });
});
