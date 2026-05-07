import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTaskRunsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { AdminNotificationDetail } from "metabase-types/api";
import {
  createMockAdminNotificationListItem,
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

type SetupOpts = {
  detail?: AdminNotificationDetail;
};

const setup = ({ detail = mockDetail() }: SetupOpts = {}) => {
  fetchMock.get("path:/api/user", { data: [], total: 0 });
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

  const onClose = jest.fn();
  const onArchive = jest.fn();
  const onUnarchive = jest.fn();
  const onChangeOwner = jest.fn();

  const utils = renderWithProviders(
    <NotificationDetailSidebar
      notificationId={detail.id}
      isBulkLoading={false}
      mockDetail={detail}
      onClose={onClose}
      onArchive={onArchive}
      onUnarchive={onUnarchive}
      onChangeOwner={onChangeOwner}
    />,
    { withRouter: true },
  );

  return {
    ...utils,
    onClose,
    onArchive,
    onUnarchive,
    onChangeOwner,
  };
};

describe("NotificationDetailSidebar", () => {
  it("renders the card name and alert id in the header", async () => {
    setup();
    expect(screen.getByText("Sales report")).toBeInTheDocument();
    expect(screen.getByText(`Alert ${NOTIFICATION_ID}`)).toBeInTheDocument();
  });

  it("renders the four sections", async () => {
    setup();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(
      screen.getByText("Last checks and send attempts"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 email recipient")).toBeInTheDocument();
    expect(screen.getByText("1 Slack channel")).toBeInTheDocument();
  });

  it("shows owner, channel summary and email recipient details", async () => {
    setup();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(
      screen.getByText("1 email recipient, 1 Slack channel"),
    ).toBeInTheDocument();
    expect(screen.getByText("Anita Williams")).toBeInTheDocument();
    expect(screen.getByText("anita@example.com")).toBeInTheDocument();
    expect(screen.getByText("#metabase-alerts")).toBeInTheDocument();
  });

  it("shows the SMTP error when the alert is failing", async () => {
    setup({ detail: mockDetail({ status: "failing" }) });
    expect(screen.getByText("Error with the SMTP server")).toBeInTheDocument();
  });

  it("close button calls onClose", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("offers archive and change-owner actions in the more menu", async () => {
    const { onArchive, onChangeOwner } = setup();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Change owner" }),
    );
    expect(onChangeOwner).toHaveBeenCalled();
  });

  it("shows unarchive when the alert is archived", async () => {
    const { onUnarchive } = setup({ detail: mockDetail({ active: false }) });
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Unarchive" }));
    expect(onUnarchive).toHaveBeenCalled();
  });

  it("renders a row in the runs table for each task run", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Question checks")).toBeInTheDocument();
    expect(screen.getByText("Alert send attempts")).toBeInTheDocument();
  });
});
