import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createMockUser } from "metabase-types/api/mocks";
import type { User, UserId } from "metabase-types/api";
import { screen, renderWithProviders, waitFor, within } from "__support__/ui";
import type { CreatedByFilterProps } from "metabase/search/types";
import { setupUsersEndpoints } from "__support__/server-mocks";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker";

const TEST_USERS: User[] = [
  createMockUser({ id: 1, common_name: "Alice" }),
  createMockUser({ id: 2, common_name: "Bob" }),
];

const TestSearchUserPicker = ({
  value,
  onChange,
}: {
  value: UserId[];
  onChange: jest.Func;
}) => {
  const [selectedUserIds, setSelectedUserIds] =
    useState<CreatedByFilterProps>(value);
  const onUserChange = (userIds: CreatedByFilterProps) => {
    setSelectedUserIds(userIds);
    onChange(userIds);
  };
  return <SearchUserPicker value={selectedUserIds} onChange={onUserChange} />;
};

const setup = async ({
  initialSelectedUsers = [],
}: { initialSelectedUsers?: UserId[] } = {}) => {
  setupUsersEndpoints(TEST_USERS);

  const mockOnChange = jest.fn();
  renderWithProviders(
    <TestSearchUserPicker
      value={initialSelectedUsers}
      onChange={mockOnChange}
    />,
  );

  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  return { mockOnChange };
};

describe("SearchUserPicker", () => {
  it("should display user list when data is available", async () => {
    await setup();

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("should show 'No users found' when no users match the filter", async () => {
    await setup();
    userEvent.type(screen.getByPlaceholderText("Search for users…"), "Charlie");
    expect(screen.getByText("No users found.")).toBeInTheDocument();
  });

  it("should show selected users in the select box on initial load", async () => {
    await setup({ initialSelectedUsers: TEST_USERS.map(user => user.id) });
    expect(
      screen.getAllByTestId("selected-user-button").map(el => el.textContent),
    ).toEqual(["Alice", "Bob"]);
  });

  it("should not show any users when there are no selected users on initial load", async () => {
    await setup();
    expect(
      screen.queryByTestId("selected-user-button"),
    ).not.toBeInTheDocument();
  });

  it("should select users when user clicks on user list", async () => {
    await setup();
    userEvent.click(screen.getByText("Alice"));
    expect(screen.getByTestId("selected-user-button")).toHaveTextContent(
      "Alice",
    );

    userEvent.click(screen.getByText("Bob"));
    expect(
      screen.getAllByTestId("selected-user-button").map(el => el.textContent),
    ).toEqual(["Alice", "Bob"]);
  });

  it("should remove users from the select box when user clicks on selected user", async () => {
    await setup({
      initialSelectedUsers: TEST_USERS.map(user => user.id),
    });
    userEvent.click(
      within(screen.getByTestId("search-user-select-box")).getByText("Alice"),
    );
    expect(screen.getByTestId("selected-user-button")).toHaveTextContent("Bob");

    userEvent.click(
      within(screen.getByTestId("search-user-select-box")).getByText("Bob"),
    );
    expect(
      screen.queryByTestId("selected-user-button"),
    ).not.toBeInTheDocument();
  });

  it("should filter users when user types in the search box", async () => {
    await setup();
    userEvent.type(screen.getByPlaceholderText("Search for users…"), "Alice");
    const searchUserList = within(screen.getByTestId("search-user-list"))
    expect(searchUserList.getByText("Alice")).toBeInTheDocument();
    expect(searchUserList.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("should call onChange with a list of user ids when the user clicks Apply filters with a selection", async () => {
    const { mockOnChange } = await setup();

    const searchUserList = within(screen.getByTestId("search-user-list"))
    userEvent.click(searchUserList.getByText("Alice"));
    userEvent.click(searchUserList.getByText("Bob"));

    userEvent.click(screen.getByText("Apply filters"));

    expect(mockOnChange).toHaveBeenCalledWith([1, 2]);
  });

  it("should call onChange with an empty list when the user clicks Apply filters with no selection", async () => {
    const { mockOnChange } = await setup({
        initialSelectedUsers: TEST_USERS.map(user => user.id),
    });
    const searchUserList = within(screen.getByTestId("search-user-select-box"))
    userEvent.click(searchUserList.getByText("Alice"));
    userEvent.click(searchUserList.getByText("Bob"));

    userEvent.click(screen.getByText("Apply filters"));
    expect(mockOnChange).toHaveBeenCalledWith([]);
  });
});
