import { render, screen, fireEvent } from "@testing-library/react";

import NotificationCard from "./NotificationCard";

const getAlert = ({ creator = getUser(), channels = [getChannel()] } = {}) => ({
  creator,
  channels,
  card: {
    name: "Alert",
  },
  created_at: "2021-05-08T02:02:07.441Z",
});

const getPulse = ({ creator = getUser(), channels = [getChannel()] } = {}) => ({
  name: "Pulse",
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
  recipients = [],
} = {}) => ({
  channel_type,
  schedule_type,
  recipients,
  schedule_hour: 8,
  schedule_day: "mon",
  schedule_frame: "first",
  details: {
    channel: "@channel",
  },
});

describe("NotificationCard", () => {
  it("should render an alert", () => {
    const alert = getAlert();
    const user = getUser();

    render(<NotificationCard item={alert} type="alert" user={user} />);

    expect(screen.getByText("Alert")).toBeInTheDocument();
    expect(screen.getByText("Emailed hourly")).toBeInTheDocument();
    expect(
      screen.getByText("Created by you on May 8, 2021"),
    ).toBeInTheDocument();
  });

  it("should render a pulse", () => {
    const pulse = getPulse();
    const user = getUser();

    render(<NotificationCard item={pulse} type="pulse" user={user} />);

    expect(screen.getByText("Pulse")).toBeInTheDocument();
    expect(screen.getByText("Emailed hourly")).toBeInTheDocument();
    expect(
      screen.getByText("Created by you on May 8, 2021"),
    ).toBeInTheDocument();
  });

  it("should render a slack alert", () => {
    const alert = getAlert({
      channels: [getChannel({ channel_type: "slack" })],
    });
    const user = getUser();

    render(<NotificationCard item={alert} type="alert" user={user} />);

    expect(screen.getByText("Slack’d hourly to @channel")).toBeInTheDocument();
  });

  it("should render a daily alert", () => {
    const alert = getAlert({
      channels: [getChannel({ schedule_type: "daily" })],
    });
    const user = getUser();

    render(<NotificationCard item={alert} type="alert" user={user} />);

    expect(screen.getByText("Emailed daily at 8:00 AM")).toBeInTheDocument();
  });

  it("should render a weekly alert", () => {
    const alert = getAlert({
      channels: [getChannel({ schedule_type: "weekly" })],
    });
    const user = getUser();

    render(<NotificationCard item={alert} type="alert" user={user} />);

    expect(screen.getByText("Emailed Monday at 8:00 AM")).toBeInTheDocument();
  });

  it("should render a monthly alert", () => {
    const alert = getAlert({
      channels: [getChannel({ schedule_type: "monthly" })],
    });
    const user = getUser();

    render(<NotificationCard item={alert} type="alert" user={user} />);

    expect(
      screen.getByText("Emailed monthly on the first Monday at 8:00 AM"),
    ).toBeInTheDocument();
  });

  it("should render an alert created by another user", () => {
    const alert = getAlert();
    const user = getUser({ id: 2 });

    render(<NotificationCard item={alert} type="alert" user={user} />);

    expect(
      screen.getByText("Created by John Doe on May 8, 2021"),
    ).toBeInTheDocument();
  });

  it("should unsubscribe when the user is not the creator and subscribed", () => {
    const creator = getUser({ id: 1 });
    const user = getUser({ id: 2 });
    const alert = getAlert({
      creator,
      channels: [getChannel({ recipients: [user] })],
    });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    render(
      <NotificationCard
        item={alert}
        type="alert"
        user={user}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        isEditable
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).toHaveBeenCalledWith(alert, "alert");
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("should unsubscribe when user user is the creator and subscribed with another user", () => {
    const creator = getUser({ id: 1 });
    const recipient = getUser({ id: 2 });
    const alert = getAlert({
      creator,
      channels: [getChannel({ recipients: [creator, recipient] })],
    });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    render(
      <NotificationCard
        item={alert}
        type="alert"
        user={creator}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        isEditable
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).toHaveBeenCalledWith(alert, "alert");
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("should hide archive button when not editable", () => {
    const creator = getUser();
    const alert = getAlert({ creator });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    render(
      <NotificationCard
        item={alert}
        type="alert"
        user={creator}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
      />,
    );

    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
  });

  it("should archive when the user is the creator and not subscribed", () => {
    const creator = getUser();
    const alert = getAlert({ creator });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    render(
      <NotificationCard
        item={alert}
        type="alert"
        user={creator}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        isEditable
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).not.toHaveBeenCalled();
    expect(onArchive).toHaveBeenCalledWith(alert, "alert");
  });

  it("should archive when the user is the creator and is the only one subscribed", () => {
    const creator = getUser();
    const alert = getAlert({
      creator,
      channels: [getChannel({ recipients: [creator] })],
    });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    render(
      <NotificationCard
        item={alert}
        type="alert"
        user={creator}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        isEditable
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).not.toHaveBeenCalled();
    expect(onArchive).toHaveBeenCalledWith(alert, "alert");
  });
});
