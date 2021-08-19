import React from "react";
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
} = {}) => ({
  channel_type,
  schedule_type,
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

    screen.getByText("Alert");
    screen.getByText("Emailed hourly", { exact: false });
    screen.getByText("Created by you on May 8, 2021", { exact: false });
  });

  it("should render a pulse", () => {
    const pulse = getPulse();
    const user = getUser();

    render(<NotificationCard item={pulse} type="pulse" user={user} />);

    screen.getByText("Pulse");
    screen.getByText("Emailed hourly", { exact: false });
    screen.getByText("Created by you on May 8, 2021", { exact: false });
  });

  it("should render a slack alert", () => {
    const alert = getAlert({
      channels: [getChannel({ channel_type: "slack" })],
    });
    const user = getUser();

    render(<NotificationCard item={alert} type="alert" user={user} />);

    screen.getByText("Slack’d hourly to @channel", { exact: false });
  });

  it("should render a daily alert", () => {
    const alert = getAlert({
      channels: [getChannel({ schedule_type: "daily" })],
    });
    const user = getUser();

    render(<NotificationCard item={alert} type="alert" user={user} />);

    screen.getByText("Emailed daily at 8:00 AM", { exact: false });
  });

  it("should render a weekly alert", () => {
    const alert = getAlert({
      channels: [getChannel({ schedule_type: "weekly" })],
    });
    const user = getUser();

    render(<NotificationCard item={alert} type="alert" user={user} />);

    screen.getByText("Emailed Monday at 8:00 AM", { exact: false });
  });

  it("should render a monthly alert", () => {
    const alert = getAlert({
      channels: [getChannel({ schedule_type: "monthly" })],
    });
    const user = getUser();

    render(<NotificationCard item={alert} type="alert" user={user} />);

    screen.getByText("Emailed monthly on the first Monday", { exact: false });
    screen.getByText("at 8:00 AM", { exact: false });
  });

  it("should render an alert created by another user", () => {
    const alert = getAlert();
    const user = getUser({ id: 2 });

    render(<NotificationCard item={alert} type="alert" user={user} />);

    screen.getByText("Created by John Doe", { exact: false });
  });

  it("should unsubscribe when subscribed and clicked on the close icon", () => {
    const alert = getAlert();
    const user = getUser();
    const onUnsubscribe = jest.fn();

    render(
      <NotificationCard
        item={alert}
        type="alert"
        user={user}
        onUnsubscribe={onUnsubscribe}
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).toHaveBeenCalledWith(alert, "alert");
  });
});
