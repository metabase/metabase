import { render, screen, waitFor } from "__support__/ui";
import {
  createMockAlert,
  createMockChannel,
} from "metabase-types/api/mocks/alert";
import { createMockDashboardSubscription } from "metabase-types/api/mocks/pulse";
import { createMockUser } from "metabase-types/api/mocks/user";

import ArchiveModal from "./ArchiveModal";

describe("ArchiveModal", () => {
  it("should render an email alert", () => {
    const alert = createMockAlert({
      created_at: "2021-05-08T02:02:07.441Z",
      channels: [
        createMockChannel({
          channel_type: "email",
          recipients: [createMockUser()],
        }),
      ],
    });

    render(<ArchiveModal item={alert} type="alert" />);

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
      created_at: "2021-05-08T02:02:07.441Z",
      channels: [
        createMockChannel({
          channel_type: "email",
          recipients: [createMockUser()],
        }),
      ],
    });

    render(<ArchiveModal item={pulse} type="pulse" />);

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
      channels: [
        createMockChannel({
          channel_type: "slack",
          recipients: [createMockUser()],
        }),
      ],
    });

    render(<ArchiveModal item={pulse} type="pulse" />);

    expect(
      screen.getByText("1 Slack channel", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should render an alert with both email and slack channels", () => {
    const alert = createMockAlert({
      channels: [
        createMockChannel({
          channel_type: "email",
          recipients: [createMockUser(), createMockUser()],
        }),
        createMockChannel({
          channel_type: "slack",
          recipients: [createMockUser(), createMockUser(), createMockUser()],
        }),
      ],
    });

    render(<ArchiveModal item={alert} type="alert" />);

    expect(
      screen.getByText("2 emails and 3 Slack channels", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should close on submit", async () => {
    const alert = createMockAlert();
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onArchive.mockResolvedValue(undefined);

    render(
      <ArchiveModal
        item={alert}
        type="alert"
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
    const alert = createMockAlert();
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onArchive.mockRejectedValue({
      status: 500,
      data: { message: "An error occurred" },
    });

    render(
      <ArchiveModal
        item={alert}
        type="alert"
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
