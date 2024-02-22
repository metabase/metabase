import { render, screen } from "@testing-library/react";

import NotificationList from "./NotificationList";

const getPulse = () => ({
  name: "Pulse",
  channels: [],
  created_at: "2021-05-08T02:02:07.441Z",
});

const getUser = () => ({
  id: 1,
  common_name: "John Doe",
});

describe("NotificationList", () => {
  it("should render items", () => {
    const pulse = getPulse();
    const user = getUser();

    render(
      <NotificationList items={[{ item: pulse, type: "pulse" }]} user={user} />,
    );

    expect(screen.getByText("Pulse")).toBeInTheDocument();
  });

  it("should render empty state when there are no items", () => {
    const user = getUser();

    render(<NotificationList items={[]} user={user} />);

    expect(
      screen.getByText("you’ll be able to manage those here", { exact: false }),
    ).toBeInTheDocument();
  });
});
