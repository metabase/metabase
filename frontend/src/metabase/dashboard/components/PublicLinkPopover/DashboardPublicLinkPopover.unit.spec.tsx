import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupDashboardPublicLinkEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { DashboardPublicLinkPopover } from "metabase/dashboard/components/PublicLinkPopover/DashboardPublicLinkPopover";
import type { Dashboard } from "metabase-types/api";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

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

const setup = ({
  hasPublicLink = true,
}: {
  hasPublicLink?: boolean;
} = {}) => {
  const TEST_DASHBOARD = createMockDashboard({
    id: TEST_DASHBOARD_ID,
    public_uuid: hasPublicLink ? "mock-uuid" : null,
  });

  setupDashboardPublicLinkEndpoints(TEST_DASHBOARD_ID);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
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
};
describe("DashboardPublicLinkPopover", () => {
  it("should display a dashboard-specific public url", async () => {
    setup();

    expect(
      await screen.findByDisplayValue(`${SITE_URL}/public/dashboard/mock-uuid`),
    ).toBeInTheDocument();
  });

  it("should not display extensions for the public link", () => {
    setup();

    expect(screen.queryByTestId("extension-option")).not.toBeInTheDocument();
  });

  it("should call Dashboard public link API when creating link", () => {
    setup({ hasPublicLink: false });

    expect(
      fetchMock.calls(`path:/api/dashboard/${TEST_DASHBOARD_ID}/public_link`, {
        method: "POST",
      }),
    ).toHaveLength(1);
  });

  it("should call the Dashboard public link API when deleting link", async () => {
    setup({ hasPublicLink: true });
    await userEvent.click(screen.getByText("Remove public link"));
    expect(
      fetchMock.calls(`path:/api/dashboard/${TEST_DASHBOARD_ID}/public_link`, {
        method: "DELETE",
      }),
    ).toHaveLength(1);
  });
});
