import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupDashboardPublicLinkEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { expectNoBadSchemaEvents } from "__support__/snowplow";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type * as Analytics from "metabase/analytics";
import type { Dashboard } from "metabase-types/api";
import { createMockDashboard, createMockUser } from "metabase-types/api/mocks";

import { DashboardPublicLinkPopover } from "./DashboardPublicLinkPopover";

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
const { trackSchemaEvent } =
  jest.requireMock<typeof Analytics>("metabase/analytics");

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
};

describe("DashboardPublicLinkPopover", () => {
  beforeEach(() => {
    jest.mocked(trackSchemaEvent).mockClear();
  });

  it("should display a dashboard-specific public url", async () => {
    setup();

    expect(
      await screen.findByDisplayValue(`${SITE_URL}/public/dashboard/mock-uuid`),
    ).toBeInTheDocument();
  });

  it("should not display extensions for the public link", async () => {
    setup();
    await screen.findByDisplayValue(`${SITE_URL}/public/dashboard/mock-uuid`);

    expect(screen.queryByTestId("extension-option")).not.toBeInTheDocument();
  });

  it("should call Dashboard public link API when creating link", async () => {
    setup({ hasPublicLink: false });

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
    setup({ hasPublicLink: true });
    await userEvent.click(screen.getByText("Remove public link"));
    expect(
      fetchMock.callHistory.calls(
        `path:/api/dashboard/${TEST_DASHBOARD_ID}/public_link`,
        {
          method: "DELETE",
        },
      ),
    ).toHaveLength(1);
  });

  it("should track copying and removing the public link", async () => {
    setup({ hasPublicLink: true });
    await screen.findByDisplayValue(`${SITE_URL}/public/dashboard/mock-uuid`);

    await userEvent.click(screen.getByTestId("copy-button"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${SITE_URL}/public/dashboard/mock-uuid`,
    );
    expect(trackSchemaEvent).toHaveBeenCalledTimes(1);
    expect(trackSchemaEvent).toHaveBeenLastCalledWith("embed_flow", {
      event: "public_link_copied",
      artifact: "dashboard",
      format: null,
    });

    await userEvent.click(screen.getByText("Remove public link"));
    expect(trackSchemaEvent).toHaveBeenCalledTimes(2);
    expect(trackSchemaEvent).toHaveBeenLastCalledWith("embed_flow", {
      event: "public_link_removed",
      artifact: "dashboard",
      source: "public-share",
    });

    expectNoBadSchemaEvents(
      jest.mocked(trackSchemaEvent).mock.calls,
      "embed_flow",
      "1-0-3",
    );
  });

  it("should not show non-admins the option to remove a public link", async () => {
    setup({ isAdmin: false });
    await screen.findByDisplayValue(`${SITE_URL}/public/dashboard/mock-uuid`);

    expect(screen.queryByText("Remove public link")).not.toBeInTheDocument();
  });
});
