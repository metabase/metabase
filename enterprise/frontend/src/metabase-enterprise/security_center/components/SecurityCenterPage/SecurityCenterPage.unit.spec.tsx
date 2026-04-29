import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { Location } from "history";

import { setupRecentViewsAndSelectionsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { Advisory } from "metabase-types/api";
import { createMockVersion } from "metabase-types/api/mocks";
import { createAdvisory } from "metabase-types/api/mocks/security-center";
import { createMockSettingsState } from "metabase-types/store/mocks";

import * as notificationHook from "../../hooks/use-notification-config";
import * as advisoriesHook from "../../hooks/use-security-advisories";

import { SecurityCenterPage } from "./SecurityCenterPage";

jest.mock("metabase/common/components/AdminLayout/AdminSettingsLayout", () => ({
  AdminSettingsLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockAcknowledge = jest.fn();
const mockAcknowledgeAll = jest.fn();

function setup(
  advisories: Advisory[] = [],
  {
    lastCheckedAt = null,
    location,
  }: {
    lastCheckedAt?: string | null;
    location?: Location<{ open?: string }>;
  } = {},
) {
  jest.spyOn(advisoriesHook, "useSecurityAdvisories").mockReturnValue({
    data: advisories,
    lastCheckedAt,
    isLoading: false,
    isError: false,
    acknowledgeAdvisory: mockAcknowledge,
    acknowledgeAdvisories: mockAcknowledgeAll,
  });

  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  jest.spyOn(notificationHook, "useNotificationConfigState").mockReturnValue({
    config: {
      email: {
        sendToAllAdmins: true,
        handler: { channel_type: "channel/email", recipients: [] },
      },
      slack: {
        enabled: false,
        handler: { channel_type: "channel/slack", recipients: [] },
      },
    },
    users: [],
    channels: undefined,
    updateEmailHandler: jest.fn(),
    toggleSendToAllAdmins: jest.fn(),
    updateSlackHandler: jest.fn(),
    toggleSlack: jest.fn(),
    save: jest.fn(),
    resetConfig: jest.fn(),
  });

  renderWithProviders(<SecurityCenterPage location={location} />, {
    storeInitialState: {
      settings: createMockSettingsState({
        version: createMockVersion({ tag: "v0.59.3" }),
      }),
    },
  });
}

describe("SecurityCenterPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockAcknowledge.mockClear();
    mockAcknowledgeAll.mockClear();
  });

  it("renders the title and current version", async () => {
    setup();

    expect(screen.getByText("Security Center")).toBeInTheDocument();
    expect(screen.getByTestId("current-version")).toHaveTextContent("v0.59.3");
  });

  it("renders the empty state when there are no advisories", async () => {
    setup([]);

    expect(
      screen.getByText(
        /No known security issues that impact your Metabase version/,
      ),
    ).toBeInTheDocument();
  });

  it("renders advisory cards in the correct order (affected first, then by severity)", async () => {
    const advisories = [
      createAdvisory({
        advisory_id: "1",
        title: "Low not affected",
        severity: "low",
        match_status: "not_affected",
      }),
      createAdvisory({
        advisory_id: "2",
        title: "Critical affected",
        severity: "critical",
        match_status: "active",
      }),
      createAdvisory({
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

  it("shows 'not affected' badge on non-affecting cards", async () => {
    const advisories = [
      createAdvisory({ advisory_id: "1", match_status: "active" }),
      createAdvisory({ advisory_id: "2", match_status: "not_affected" }),
    ];

    setup(advisories);

    expect(
      screen.getByText("Your instance is not affected"),
    ).toBeInTheDocument();
  });

  it("renders external links with correct targets", async () => {
    const advisories = [
      createAdvisory({
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

  it("calls acknowledgeAdvisory when dismiss button is clicked", async () => {
    const advisories = [
      createAdvisory({ advisory_id: "SA-001", acknowledged_at: null }),
    ];

    setup(advisories);

    await userEvent.click(screen.getByTestId("acknowledge-button"));
    expect(mockAcknowledge).toHaveBeenCalledWith("SA-001");
  });

  it("calls acknowledgeAdvisories with only undismissed non-affecting advisory ids when 'Dismiss all' is clicked", async () => {
    const advisories = [
      createAdvisory({
        advisory_id: "SA-001",
        match_status: "active",
        severity: "critical",
      }),
      createAdvisory({
        advisory_id: "SA-002",
        match_status: "not_affected",
        severity: "medium",
      }),
      createAdvisory({
        advisory_id: "SA-003",
        match_status: "not_affected",
        severity: "low",
        acknowledged_at: "2026-03-01T00:00:00Z",
      }),
    ];

    setup(advisories);

    await userEvent.click(screen.getByText("Dismiss all"));
    expect(mockAcknowledgeAll).toHaveBeenCalledWith(["SA-002"]);
  });

  it("does not show 'Dismiss all' when there are no non-affecting advisories", async () => {
    const advisories = [
      createAdvisory({
        advisory_id: "SA-001",
        match_status: "active",
        severity: "critical",
      }),
    ];

    setup(advisories);

    expect(screen.queryByText("Dismiss all")).not.toBeInTheDocument();
  });

  it("does not show 'Dismiss all' when all non-affecting advisories are already dismissed", async () => {
    const advisories = [
      createAdvisory({
        advisory_id: "SA-001",
        match_status: "not_affected",
        acknowledged_at: "2026-03-01T00:00:00Z",
      }),
      createAdvisory({
        advisory_id: "SA-002",
        match_status: "not_affected",
        acknowledged_at: "2026-03-01T00:00:00Z",
      }),
    ];

    setup(advisories);

    // Enable showing dismissed advisories so they appear in the list
    await userEvent.click(screen.getByTestId("show-acknowledged-filter"));

    expect(screen.queryByText("Dismiss all")).not.toBeInTheDocument();
  });

  it("does not show dismiss button for already dismissed advisories", async () => {
    const advisories = [
      createAdvisory({
        advisory_id: "SA-001",
        acknowledged_at: "2026-03-01T00:00:00Z",
      }),
    ];

    setup(advisories);

    // Dismissed advisories are hidden by default — enable the checkbox first
    await userEvent.click(screen.getByTestId("show-acknowledged-filter"));

    const button = screen.getByTestId("acknowledge-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Dismissed");
  });

  it("hides dismissed advisories by default", async () => {
    const advisories = [
      createAdvisory({
        advisory_id: "1",
        title: "Visible",
        acknowledged_at: null,
      }),
      createAdvisory({
        advisory_id: "2",
        title: "Hidden",
        acknowledged_at: "2026-03-01T00:00:00Z",
      }),
    ];

    setup(advisories);

    expect(screen.getByText("Visible")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("renders the filter bar", async () => {
    setup([]);

    expect(screen.getByTestId("advisory-filter-bar")).toBeInTheDocument();
  });

  describe("upgrade banner", () => {
    it("shows the upgrade banner when there are active advisories", async () => {
      const advisories = [
        createAdvisory({
          advisory_id: "1",
          match_status: "active",
          affected_versions: [{ min: "0.58.0", fixed: "0.59.4" }],
        }),
      ];

      setup(advisories);

      const banner = screen.getByTestId("upgrade-banner");
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent("0.59.4");
      expect(banner).toHaveTextContent("A security update is available");
    });

    it("does not show the upgrade banner when there are no active advisories", async () => {
      const advisories = [
        createAdvisory({
          advisory_id: "1",
          match_status: "not_affected",
        }),
      ];

      setup(advisories);

      expect(screen.queryByTestId("upgrade-banner")).not.toBeInTheDocument();
    });

    it("shows the highest fixed version across multiple active advisories", async () => {
      const advisories = [
        createAdvisory({
          advisory_id: "1",
          match_status: "active",
          affected_versions: [{ min: "0.58.0", fixed: "0.59.2" }],
        }),
        createAdvisory({
          advisory_id: "2",
          match_status: "active",
          affected_versions: [{ min: "0.58.0", fixed: "0.59.5" }],
        }),
      ];

      setup(advisories);

      const banner = screen.getByTestId("upgrade-banner");
      expect(banner).toHaveTextContent("0.59.5");
    });

    it("includes a link to upgrade instructions", async () => {
      const advisories = [
        createAdvisory({
          advisory_id: "1",
          match_status: "active",
          affected_versions: [{ min: "0.58.0", fixed: "0.59.4" }],
        }),
      ];

      setup(advisories);

      const link = screen.getByText("View upgrade instructions");
      expect(link).toHaveAttribute(
        "href",
        "https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase",
      );
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("does not show the upgrade banner when there are no advisories", async () => {
      setup([]);

      expect(screen.queryByTestId("upgrade-banner")).not.toBeInTheDocument();
    });
  });

  describe("notification settings modal", () => {
    it("opens the modal when the 'open=notifications' query param is set", async () => {
      setup([], {
        location: {
          query: { open: "notifications" },
        } as Location<{ open?: string }>,
      });

      expect(
        await screen.findByRole("dialog", { name: "Notification settings" }),
      ).toBeInTheDocument();
    });

    it("does not open the modal when the query param is not set", async () => {
      setup();

      expect(
        screen.queryByRole("dialog", { name: "Notification settings" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("sync polling", () => {
    it("disables the sync button while syncing", async () => {
      fetchMock.post("path:/api/ee/security-center/sync", 200);
      setup();

      await userEvent.click(screen.getByTestId("sync-advisories"));

      expect(screen.getByTestId("sync-advisories")).toBeDisabled();
    });

    it("passes isPolling to useSecurityAdvisories after sync is triggered", async () => {
      fetchMock.post("path:/api/ee/security-center/sync", 200);
      const spy = jest.spyOn(advisoriesHook, "useSecurityAdvisories");
      setup();

      // Before sync, the hook should be called without polling
      expect(spy).toHaveBeenCalledWith(false);

      await userEvent.click(screen.getByTestId("sync-advisories"));

      // After sync, the hook should be called with polling enabled
      expect(spy).toHaveBeenCalledWith(true);
    });
  });
});
