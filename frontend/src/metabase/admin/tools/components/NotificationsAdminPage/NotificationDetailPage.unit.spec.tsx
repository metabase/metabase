import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupTaskRunsEndpoints } from "__support__/server-mocks";
import { setupAdminNotificationDetailEndpoint } from "__support__/server-mocks/notification";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import * as Urls from "metabase/utils/urls";
import type { AdminNotificationDetail } from "metabase-types/api";
import {
  createMockAdminNotificationListItem,
  createMockCard,
  createMockNotificationHandlerEmail,
  createMockTaskRun,
  createMockUserInfo,
} from "metabase-types/api/mocks";

import { NotificationDetailPage } from "./NotificationDetailPage";

const NOTIFICATION_ID = 11;
const PATHNAME = "/admin/tools/notifications/:notificationId";
const INITIAL_ROUTE = Urls.adminToolsNotificationDetail(NOTIFICATION_ID);

const mockDetail = (
  overrides: Partial<AdminNotificationDetail> = {},
): AdminNotificationDetail =>
  createMockAdminNotificationListItem({
    id: NOTIFICATION_ID,
    payload: {
      id: 1,
      card_id: 42,
      send_once: false,
      send_condition: "has_result",
      created_at: "2025-01-07T18:40:47.245205+03:00",
      updated_at: "2025-01-07T18:40:47.245205+03:00",
      card: createMockCard({ id: 42, name: "Sales report" }),
    },
    creator: createMockUserInfo({
      common_name: "Marketing Maggie",
      email: "maggie@example.com",
    }),
    handlers: [createMockNotificationHandlerEmail()],
    ...overrides,
  });

interface SetupOpts {
  detail?: AdminNotificationDetail;
}

const setup = ({ detail = mockDetail() }: SetupOpts = {}) => {
  fetchMock.get("path:/api/user", { data: [], total: 0 });
  setupAdminNotificationDetailEndpoint(detail);
  setupTaskRunsEndpoints({
    data: [
      createMockTaskRun({
        id: 1,
        run_type: "alert",
        entity_type: "card",
        entity_id: detail.payload?.card_id,
        status: "success",
        started_at: "2026-04-21T16:00:00.000Z",
        ended_at: "2026-04-21T16:00:01.000Z",
      }),
    ],
    limit: 5,
    offset: 0,
    total: 1,
  });

  return renderWithProviders(
    <Route path={PATHNAME} component={NotificationDetailPage} />,
    {
      initialRoute: INITIAL_ROUTE,
      withRouter: true,
    },
  );
};

describe("NotificationDetailPage", () => {
  it("uses the card name as the page title (not 'Notification #N')", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    // Primary heading is the card name
    expect(
      screen.getByRole("heading", { level: 2, name: /Sales report/ }),
    ).toBeInTheDocument();

    // "Alert #11" is shown as a smaller subtitle, not in a heading
    expect(screen.getByText(`Alert #${NOTIFICATION_ID}`)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Notification #/ }),
    ).not.toBeInTheDocument();
  });

  it("does not render the redundant 'Alert' badge in the header", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    // Only "Alert #11" as subtitle text should appear — no standalone badge
    // saying just "Alert".
    expect(screen.queryByText(/^Alert$/)).not.toBeInTheDocument();
  });

  it("renders a single 'Change owner' primary action", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(
      screen.getAllByRole("button", { name: "Change owner" }),
    ).toHaveLength(1);
  });

  it("shows 'Back to notifications' link", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    const link = screen.getByRole("link", { name: /Back to notifications/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", Urls.adminToolsNotifications());
  });

  it("renders Details, Recipients, and Send history sections", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(
      screen.getByRole("heading", { level: 3, name: "Details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Recipients" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Send history" }),
    ).toBeInTheDocument();
  });

  it("shows a recipient in the Recipients section", async () => {
    setup({
      detail: mockDetail({
        handlers: [
          createMockNotificationHandlerEmail({
            recipients: [
              {
                type: "notification-recipient/user",
                updated_at: "2025-01-07T18:40:47.245205+03:00",
                permissions_group_id: null,
                details: null,
                id: 9,
                user_id: 1,
                notification_handler_id: 12,
                user: createMockUserInfo({
                  common_name: "Alice",
                  email: "alice@example.com",
                }),
                created_at: "2025-01-07T18:40:47.245205+03:00",
              },
            ],
          }),
        ],
      }),
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("renders a clickable recent-runs list in Send history", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    // The recent-runs query is a separate RTK Query that settles after the
    // primary detail loader, so wait specifically for the run link.
    const runLink = await screen.findByRole("link", {
      name: /April 21, 2026/,
    });
    expect(runLink).toHaveAttribute("href", "/admin/tools/tasks/runs/1");
    expect(screen.getByText(/Success/i)).toBeInTheDocument();
  });

  it("back link returns to the notifications list", async () => {
    const { history } = setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(
      screen.getByRole("link", { name: /Back to notifications/ }),
    );

    expect(history?.getCurrentLocation().pathname).toBe(
      Urls.adminToolsNotifications(),
    );
  });
});
