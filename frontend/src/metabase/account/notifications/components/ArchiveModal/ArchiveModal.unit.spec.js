import { render, screen, waitFor } from "@testing-library/react";

import ArchiveModal from "./ArchiveModal";

const getAlert = ({ creator = getUser(), channels = [getChannel()] } = {}) => ({
  creator,
  channels,
  created_at: "2021-05-08T02:02:07.441Z",
});

const getPulse = ({ creator = getUser(), channels = [getChannel()] } = {}) => ({
  creator,
  channels,
  created_at: "2021-05-08T02:02:07.441Z",
});

const getUser = ({ id = 1 } = {}) => ({
  id,
  common_name: "John Doe",
});

const getChannel = ({
  channel_type = "email",
  schedule_type = "hourly",
  recipients = [getUser()],
} = {}) => {
  return {
    channel_type,
    schedule_type,
    recipients,
    schedule_hour: 8,
    schedule_day: "mon",
    schedule_frame: "first",
  };
};

describe("ArchiveModal", () => {
  it("should render an email alert", () => {
    const alert = getAlert();

    render(<ArchiveModal item={alert} type="alert" />);

    expect(screen.getByText("Delete this alert?")).toBeInTheDocument();
    expect(screen.getByText("Yes, delete this alert")).toBeInTheDocument();
    expect(
      screen.getByText("You created this alert on May 8, 2021", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("It’s currently being sent to 1 email.", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("should render an email pulse", () => {
    const pulse = getPulse();

    render(<ArchiveModal item={pulse} type="pulse" />);

    expect(screen.getByText("Delete this subscription?")).toBeInTheDocument();
    expect(
      screen.getByText("Yes, delete this subscription"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("May 8, 2021", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("It’s currently being sent to 1 email.", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("should render a slack pulse", () => {
    const pulse = getPulse({
      channels: [getChannel({ channel_type: "slack" })],
    });

    render(<ArchiveModal item={pulse} type="pulse" />);

    expect(
      screen.getByText("1 Slack channel", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should render an alert with both email and slack channels", () => {
    const alert = getAlert({
      channels: [
        getChannel({
          channel_type: "email",
          recipients: [getUser(), getUser()],
        }),
        getChannel({
          channel_type: "slack",
          recipients: [getUser(), getUser(), getUser()],
        }),
      ],
    });

    render(<ArchiveModal item={alert} type="alert" />);

    expect(
      screen.getByText("2 emails and 3 Slack channels", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should close on submit", async () => {
    const alert = getAlert();
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onArchive.mockResolvedValue();

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
    const alert = getAlert();
    const onArchive = jest.fn();
    const onClose = jest.fn();

    onArchive.mockRejectedValue({ data: { message: "An error occurred" } });

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
