import { screen } from "@testing-library/react";

import { renderWithTheme } from "__support__/ui";
import {
  createMockDashboardSubscription,
  createMockUser,
} from "metabase-types/api/mocks";

import { NotificationList } from "./NotificationList";

const mockUser = createMockUser({ common_name: "John Doe" });

describe("NotificationList", () => {
  it("should render items", () => {
    const pulse = createMockDashboardSubscription();

    renderWithTheme(
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
    renderWithTheme(
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
