import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTaskRunsEndpoints } from "__support__/server-mocks";
import { setupAdminNotificationDetailEndpoint } from "__support__/server-mocks/notification";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type {
  AdminNotification,
  NotificationId,
  TaskRun,
} from "metabase-types/api";
import {
  createMockAdminNotification,
  createMockCard,
  createMockNotificationHandlerEmail,
  createMockNotificationHandlerSlack,
  createMockNotificationRecipientUser,
  createMockTaskRun,
  createMockUserInfo,
} from "metabase-types/api/mocks";

import { NotificationDetailSidebar } from "./NotificationDetailSidebar";

const NOTIFICATION_ID = 11;

const mockDetail = (
  overrides: Partial<AdminNotification> = {},
): AdminNotification =>
  createMockAdminNotification({
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
    owner: createMockUserInfo({
      common_name: "John Doe",
      email: "john@example.com",
    }),
    handlers: [
      createMockNotificationHandlerEmail({
        recipients: [
          createMockNotificationRecipientUser({
            id: 1,
            user: createMockUserInfo({
              common_name: "Anita Williams",
              email: "anita@example.com",
            }),
          }),
        ],
      }),
      createMockNotificationHandlerSlack({
        recipients: [
          {
            type: "notification-recipient/raw-value",
            details: { value: "#metabase-alerts" },
            id: 99,
          },
        ],
      }),
    ],
    ...overrides,
  });

interface SetupOpts {
  detail?: AdminNotification;
  taskRuns?: TaskRun[];
  prevNotificationId?: NotificationId | null;
  nextNotificationId?: NotificationId | null;
}

const setup = ({
  detail = mockDetail(),
  taskRuns,
  prevNotificationId = null,
  nextNotificationId = null,
}: SetupOpts = {}) => {
  fetchMock.get("path:/api/user", { data: [], total: 0 });
  setupAdminNotificationDetailEndpoint(detail);
  setupTaskRunsEndpoints({
    data: taskRuns ?? [
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
    limit: 20,
    offset: 0,
    total: 1,
  });

  const onClose = jest.fn();
  const onDelete = jest.fn();

  const utils = renderWithProviders(
    <NotificationDetailSidebar
      notificationId={detail.id}
      isBulkLoading={false}
      prevNotificationId={prevNotificationId}
      nextNotificationId={nextNotificationId}
      onClose={onClose}
      onDelete={onDelete}
    />,
    { withRouter: true },
  );

  return {
    ...utils,
    onClose,
    onDelete,
  };
};

describe("NotificationDetailSidebar", () => {
  it("renders the card name and alert id in the header", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Sales report")).toBeInTheDocument();
    expect(screen.getByText(`Alert ${NOTIFICATION_ID}`)).toBeInTheDocument();
  });

  it("renders Check history and Send history as separate sections", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Check history")).toBeInTheDocument();
    expect(screen.getByText("Send history")).toBeInTheDocument();
    expect(screen.getAllByText("View all").length).toBeGreaterThanOrEqual(2);
  });

  it("shows a Successful badge for successful runs", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getAllByText("Successful").length).toBeGreaterThan(0);
  });

  it("close button calls onClose", async () => {
    const { onClose } = setup();
    await waitForLoaderToBeRemoved();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("disables prev/next buttons when there is no neighbor", async () => {
    setup({ prevNotificationId: null, nextNotificationId: null });
    await waitForLoaderToBeRemoved();
    expect(
      screen.getByRole("button", { name: "Previous alert" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next alert" })).toBeDisabled();
  });

  it("enables next button when a next notification exists", async () => {
    setup({ nextNotificationId: 22 });
    await waitForLoaderToBeRemoved();
    expect(screen.getByRole("button", { name: "Next alert" })).toBeEnabled();
  });

  it("offers delete in the more menu when active", async () => {
    const { onDelete } = setup({ detail: mockDetail({ active: true }) });
    await waitForLoaderToBeRemoved();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Delete alert/ }),
    );
    expect(onDelete).toHaveBeenCalled();
  });
});
