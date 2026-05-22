import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupDashboardPublicLinkEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Dashboard } from "metabase-types/api";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";

import { DashboardPublicLinkPopover } from "./DashboardPublicLinkPopover";

const SITE_URL = "http://metabase.test";
const TEST_DASHBOARD_ID = 1;

const TestComponent = ({
  dashboard,
  onClose: onCloseMock,
}: {
  dashboard: Dashboard;
  onClose: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const onClose = () => {
    setIsOpen(false);
    onCloseMock();
  };

  return (
    <DashboardPublicLinkPopover
      dashboard={dashboard}
      isOpen={isOpen}
      onClose={onClose}
      target={<button>Target</button>}
    />
  );
};

const setup = async ({
  hasPublicLink = true,
  isAdmin = true,
}: {
  hasPublicLink?: boolean;
  isAdmin?: boolean;
} = {}) => {
  const TEST_DASHBOARD = createMockDashboard({
    id: TEST_DASHBOARD_ID,
    public_uuid: hasPublicLink ? "mock-uuid" : null,
  });

  setupDashboardPublicLinkEndpoints(TEST_DASHBOARD_ID);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "site-url": SITE_URL,
    }),
  });

  const onClose = jest.fn();

  renderWithProviders(
    <TestComponent dashboard={TEST_DASHBOARD} onClose={onClose} />,
    {
      storeInitialState: state,
    },
  );

  // The PublicLinkPopover opens on mount and runs its useAsync hook, which
  // flips a loading state once it settles. Wait for that loading state to
  // clear (the input drops its "Loading…" placeholder) so the async state
  // update stays wrapped in act.
  if (hasPublicLink) {
    await screen.findByDisplayValue(`${SITE_URL}/public/dashboard/mock-uuid`);
  } else {
    await waitFor(() => {
      expect(screen.getByTestId("public-link-input")).not.toHaveAttribute(
        "placeholder",
        "Loading…",
      );
    });
  }
};

describe("DashboardPublicLinkPopover", () => {
  it("should display a dashboard-specific public url", async () => {
    await setup();

    expect(
      await screen.findByDisplayValue(`${SITE_URL}/public/dashboard/mock-uuid`),
    ).toBeInTheDocument();
  });

  it("should not display extensions for the public link", async () => {
    await setup();

    expect(screen.queryByTestId("extension-option")).not.toBeInTheDocument();
  });

  it("should call Dashboard public link API when creating link", async () => {
    await setup({ hasPublicLink: false });

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(
          `path:/api/dashboard/${TEST_DASHBOARD_ID}/public_link`,
          {
            method: "POST",
          },
        ),
      ).toHaveLength(1);
    });
  });

  it("should call the Dashboard public link API when deleting link", async () => {
    await setup({ hasPublicLink: true });
    await userEvent.click(screen.getByText("Remove public link"));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(
          `path:/api/dashboard/${TEST_DASHBOARD_ID}/public_link`,
          {
            method: "DELETE",
          },
        ),
      ).toHaveLength(1);
    });
    // Removing the link closes the popover; wait for it to disappear so the
    // resulting state update stays wrapped in act.
    await waitFor(() => {
      expect(
        screen.queryByTestId("public-link-popover-content"),
      ).not.toBeInTheDocument();
    });
  });

  it("should not show non-admins the option to remove a public link", async () => {
    await setup({ isAdmin: false });

    expect(screen.queryByText("Remove public link")).not.toBeInTheDocument();
  });
});
