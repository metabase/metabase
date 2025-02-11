import { render, screen } from "@testing-library/react";

import { createMockAlert, createMockUser } from "metabase-types/api/mocks";

import { NotificationList } from "./NotificationList";

const mockUser = createMockUser({ common_name: "John Doe" });

describe("NotificationList", () => {
  it("should render items", () => {
    const pulse = createMockAlert({ name: "Pulse" });

    render(
      <NotificationList
        listItems={[{ item: pulse, type: "pulse" }]}
        user={mockUser}
        canManageSubscriptions
        onArchive={jest.fn()}
        onHelp={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(screen.getByText("Pulse")).toBeInTheDocument();
  });

  it("should render empty state when there are no items", () => {
    render(
      <NotificationList
        listItems={[]}
        user={mockUser}
        canManageSubscriptions
        onArchive={jest.fn()}
        onHelp={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(
      screen.getByText("you’ll be able to manage those here", { exact: false }),
    ).toBeInTheDocument();
  });
});
