import userEvent from "@testing-library/user-event";

import { setupRecentViewsAndSelectionsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";

import * as notificationHook from "../../hooks/use-notification-config";
import * as advisoriesHook from "../../hooks/use-security-advisories";
import type { Advisory } from "../../types";

import { SecurityCenterPage } from "./SecurityCenterPage";

const makeAdvisory = (overrides: Partial<Advisory>): Advisory => ({
  id: "SA-001",
  title: "Test advisory",
  description: "Test description",
  severity: "medium",
  affectedVersionRange: ">=0.45.0 <0.59.0",
  fixedVersion: "v0.59.0",
  publishedAt: "2026-01-01T00:00:00Z",
  advisoryUrl: "https://example.com/advisory",
  upgradeUrl: "https://example.com/upgrade",
  affected: false,
  acknowledged: false,
  ...overrides,
});

const mockAcknowledge = jest.fn();

function setup(advisories: Advisory[] = []) {
  jest.spyOn(advisoriesHook, "useSecurityAdvisories").mockReturnValue({
    data: advisories,
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
        id: "1",
        title: "Low not affected",
        severity: "low",
        affected: false,
      }),
      makeAdvisory({
        id: "2",
        title: "Critical affected",
        severity: "critical",
        affected: true,
      }),
      makeAdvisory({
        id: "3",
        title: "High affected",
        severity: "high",
        affected: true,
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
      makeAdvisory({ id: "1", affected: true }),
      makeAdvisory({ id: "2", affected: false }),
    ];

    setup(advisories);

    const statuses = screen.getAllByTestId("affected-status");
    expect(statuses[0]).toHaveTextContent("Affected");
    expect(statuses[1]).toHaveTextContent("Not affected");
  });

  it("renders external links with correct targets", () => {
    const advisories = [
      makeAdvisory({
        id: "1",
        advisoryUrl: "https://example.com/advisory/1",
        upgradeUrl: "https://example.com/upgrade/1",
      }),
    ];

    setup(advisories);

    const advisoryLink = screen.getByText("View advisory");
    expect(advisoryLink).toHaveAttribute(
      "href",
      "https://example.com/advisory/1",
    );
    expect(advisoryLink).toHaveAttribute("target", "_blank");

    const upgradeLink = screen.getByText("Upgrade guide");
    expect(upgradeLink).toHaveAttribute(
      "href",
      "https://example.com/upgrade/1",
    );
    expect(upgradeLink).toHaveAttribute("target", "_blank");
  });

  it("calls acknowledgeAdvisory when acknowledge button is clicked", async () => {
    const advisories = [makeAdvisory({ id: "SA-001", acknowledged: false })];

    setup(advisories);

    await userEvent.click(screen.getByTestId("acknowledge-button"));
    expect(mockAcknowledge).toHaveBeenCalledWith("SA-001");
  });

  it("does not show acknowledge button for already acknowledged advisories", async () => {
    const advisories = [makeAdvisory({ id: "SA-001", acknowledged: true })];

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
      makeAdvisory({ id: "1", title: "Visible", acknowledged: false }),
      makeAdvisory({ id: "2", title: "Hidden", acknowledged: true }),
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
