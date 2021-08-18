import React from "react";
import { render, screen } from "@testing-library/react";
import NotificationList from "./NotificationList";

const getPulse = ({
  creatorId = 1,
  channel_type = "email",
  schedule_type = "hourly",
} = {}) => ({
  name: "Pulse",
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

describe("NotificationList", () => {
  it("should render items", () => {
    const pulse = getPulse();

    render(<NotificationList items={[{ item: pulse, type: "pulse" }]} />);

    screen.getByText("Pulse");
  });

  it("should render empty state when there are no items", () => {
    render(<NotificationList items={[]} />);

    screen.getByText("you’ll be able to manage those here", { exact: false });
  });
});
