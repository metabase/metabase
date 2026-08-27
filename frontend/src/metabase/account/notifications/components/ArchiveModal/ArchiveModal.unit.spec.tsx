import { render, screen, waitFor } from "__support__/ui";
import { getNextId } from "__support__/utils";
import {
  createMockAlert,
  createMockChannel,
} from "metabase-types/api/mocks/alert";
import { createMockDashboardSubscription } from "metabase-types/api/mocks/pulse";
import { createMockUser } from "metabase-types/api/mocks/user";

import { ArchiveNotificationModal } from "./ArchiveModal";

describe("ArchiveNotificationModal", () => {
  it("should render an email alert", () => {
    const alert = createMockAlert({
      id: getNextId(),
      created_at: "2021-05-08T02:02:07.441Z",
      channels: [
        createMockChannel({
          channel_id: getNextId(),
          channel_type: "email",
          recipients: [createMockUser({ id: getNextId() })],
        }),
      ],
    });

    render(
      <ArchiveNotificationModal
        item={alert}
        type="alert"
        user={createMockUser({ id: getNextId() })}
        hasUnsubscribed={false}
        onArchive={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText("Delete this alert?")).toBeInTheDocument();
    expect(screen.getByText("Yes, delete this alert")).toBeInTheDocument();
    expect(
      screen.getByText("You created this alert on May 8, 2021", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("It's currently being sent to 1 email.", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("should render an email pulse", () => {
    const pulse = createMockDashboardSubscription({
      id: getNextId(),
      created_at: "2021-05-08T02:02:07.441Z",
      channels: [
        createMockChannel({
          channel_id: getNextId(),
          channel_type: "email",
          recipients: [createMockUser({ id: getNextId() })],
        }),
      ],
    });

    render(
      <ArchiveNotificationModal
        item={pulse}
        type="pulse"
        user={createMockUser({ id: getNextId() })}
        hasUnsubscribed={false}
        onArchive={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText("Delete this subscription?")).toBeInTheDocument();
    expect(
      screen.getByText("Yes, delete this subscription"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("May 8, 2021", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("It's currently being sent to 1 email.", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("should render a slack pulse", () => {
    const pulse = createMockDashboardSubscription({
      id: getNextId(),
      channels: [
        createMockChannel({
          channel_id: getNextId(),
          channel_type: "slack",
          recipients: [createMockUser({ id: getNextId() })],
        }),
      ],
    });

    render(
      <ArchiveNotificationModal
        item={pulse}
        type="pulse"
        user={createMockUser({ id: getNextId() })}
        hasUnsubscribed={false}
        onArchive={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.getByText("1 Slack channel", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should render an alert with both email and slack channels", () => {
    const alert = createMockAlert({
      id: getNextId(),
      channels: [
        createMockChannel({
          channel_id: getNextId(),
          channel_type: "email",
          recipients: [
            createMockUser({ id: getNextId() }),
            createMockUser({ id: getNextId() }),
          ],
        }),
        createMockChannel({
          channel_id: getNextId(),
          channel_type: "slack",
          recipients: [
            createMockUser({ id: getNextId() }),
            createMockUser({ id: getNextId() }),
            createMockUser({ id: getNextId() }),
          ],
        }),
      ],
    });

    render(
      <ArchiveNotificationModal
        item={alert}
        type="alert"
        user={createMockUser({ id: getNextId() })}
        hasUnsubscribed={false}
        onArchive={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.getByText("2 emails and 3 Slack channels", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should close on submit", async () => {
    const alert = createMockAlert({ id: getNextId() });
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onArchive.mockResolvedValue(undefined);

    render(
      <ArchiveNotificationModal
        item={alert}
        type="alert"
        user={createMockUser({ id: getNextId() })}
        hasUnsubscribed={false}
        onArchive={onArchive}
        onClose={onClose}
      />,
    );

    screen.getByText("Yes, delete this alert").click();

    await waitFor(() => {
      expect(onArchive).toHaveBeenCalledWith(alert, true);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("should not close on a submit error", async () => {
    const alert = createMockAlert({ id: getNextId() });
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onArchive.mockRejectedValue({
      status: 500,
      data: { message: "An error occurred" },
    });

    render(
      <ArchiveNotificationModal
        item={alert}
        type="alert"
        user={createMockUser({ id: getNextId() })}
        hasUnsubscribed={false}
        onArchive={onArchive}
        onClose={onClose}
      />,
    );

    screen.getByText("Yes, delete this alert").click();

    await waitFor(() => {
      expect(screen.getByText("An error occurred")).toBeInTheDocument();
    });
    expect(onArchive).toHaveBeenCalledWith(alert, true);
    expect(onClose).not.toHaveBeenCalled();
  });
});
