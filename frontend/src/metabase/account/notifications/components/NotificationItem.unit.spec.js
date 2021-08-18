import React from "react";
import { render, screen } from "@testing-library/react";
import NotificationItem from "./NotificationItem";

const getAlert = ({
  creatorId = 1,
  channel_type = "email",
  schedule_type = "hourly",
} = {}) => ({
  card: {
    name: "Chart",
  },
  creator: {
    id: creatorId,
    common_name: "John Doe",
  },
  channels: [
    {
      channel_type,
      schedule_type,
      schedule_hour: 8,
      schedule_day: "mon",
      schedule_frame: "first",
      details: {
        channel: "@channel",
      },
    },
  ],
  created_at: "2021-05-08T02:02:07.441Z",
});

const getUser = ({ id = 1 } = {}) => ({
  id,
});

describe("NotificationItem", () => {
  it("should render an email alert", () => {
    const alert = getAlert({ channel_type: "email" });
    const user = getUser();

    render(<NotificationItem item={alert} type="alert" user={user} />);

    screen.getByText("Chart");
    screen.getByText("Emailed hourly", { exact: false });
    screen.getByText("Created by you on 05/08/2021", { exact: false });
  });

  it("should render a slack alert", () => {
    const alert = getAlert({ channel_type: "slack" });
    const user = getUser();

    render(<NotificationItem item={alert} type="alert" user={user} />);

    screen.getByText("Slack’d hourly to @channel", { exact: false });
  });

  it("should render a daily alert", () => {
    const alert = getAlert({ schedule_type: "daily" });
    const user = getUser();

    render(<NotificationItem item={alert} type="alert" user={user} />);

    screen.getByText("Emailed daily at 8:00 AM", { exact: false });
  });

  it("should render a weekly alert", () => {
    const alert = getAlert({ schedule_type: "weekly" });
    const user = getUser();

    render(<NotificationItem item={alert} type="alert" user={user} />);

    screen.getByText("Emailed Monday at 8:00 AM", { exact: false });
  });

  it("should render a monthly alert", () => {
    const alert = getAlert({ schedule_type: "monthly" });
    const user = getUser();

    render(<NotificationItem item={alert} type="alert" user={user} />);

    screen.getByText("Emailed monthly on the first Monday", { exact: false });
    screen.getByText("at 8:00 AM", { exact: false });
  });

  it("should render an alert created by another user", () => {
    const alert = getAlert();
    const user = getUser({ id: 2 });

    render(<NotificationItem item={alert} type="alert" user={user} />);

    screen.getByText("Created by John Doe", { exact: false });
  });
});
