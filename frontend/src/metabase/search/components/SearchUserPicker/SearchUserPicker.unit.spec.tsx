import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupUserRecipientsEndpoint } from "__support__/server-mocks";
import { screen, renderWithProviders, waitFor, within } from "__support__/ui";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker";
import type { CreatedByFilterProps } from "metabase/search/types";
import type { User, UserId } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

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
  setupUserRecipientsEndpoint({ users: TEST_USERS });

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

  it("should show 'No results' when no users match the filter", async () => {
    await setup();
    await userEvent.type(
      screen.getByPlaceholderText("Search for someone…"),
      "Charlie",
    );
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("should show selected users in the select box on initial load", async () => {
    await setup({ initialSelectedUsers: TEST_USERS.map(user => user.id) });
    expect(
      screen.getAllByTestId("selected-user-button").map(el => el.textContent),
    ).toEqual(["Alice", "Bob"]);

    // all users are in the select box, so the search list should be empty
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("should not show any users when there are no selected users on initial load", async () => {
    await setup();
    expect(
      screen.queryByTestId("selected-user-button"),
    ).not.toBeInTheDocument();
  });

  it("should add user to select box and remove them from search list when user is selected from search list", async () => {
    await setup();
    const searchUserList = within(screen.getByTestId("search-user-list"));

    await userEvent.click(searchUserList.getByText("Alice"));
    expect(screen.getByTestId("selected-user-button")).toHaveTextContent(
      "Alice",
    );

    expect(searchUserList.queryByText("Alice")).not.toBeInTheDocument();

    await userEvent.click(searchUserList.getByText("Bob"));
    expect(
      screen.getAllByTestId("selected-user-button").map(el => el.textContent),
    ).toEqual(["Alice", "Bob"]);

    expect(searchUserList.getByText("No results")).toBeInTheDocument();
  });

  it("should remove user from select box and add them to search list when user is remove from select box", async () => {
    await setup({
      initialSelectedUsers: TEST_USERS.map(user => user.id),
    });

    const searchUserList = within(screen.getByTestId("search-user-list"));
    const selectBox = within(screen.getByTestId("search-user-select-box"));

    // expect the two users are in the select box and not in the search list
    expect(searchUserList.getByText("No results")).toBeInTheDocument();
    expect(selectBox.getByText("Alice")).toBeInTheDocument();
    expect(selectBox.getByText("Bob")).toBeInTheDocument();

    await userEvent.click(selectBox.getByText("Alice"));
    expect(screen.getByTestId("selected-user-button")).toHaveTextContent("Bob");
    expect(searchUserList.getByText("Alice")).toBeInTheDocument();

    await userEvent.click(selectBox.getByText("Bob"));

    // expect the two users are only in the search list now
    expect(
      screen.queryByTestId("selected-user-button"),
    ).not.toBeInTheDocument();
    expect(searchUserList.getByText("Alice")).toBeInTheDocument();
    expect(searchUserList.getByText("Bob")).toBeInTheDocument();
  });

  it("should filter users when user types in the search box", async () => {
    await setup();
    await userEvent.type(
      screen.getByPlaceholderText("Search for someone…"),
      "Alice",
    );
    const searchUserList = within(screen.getByTestId("search-user-list"));
    expect(searchUserList.getByText("Alice")).toBeInTheDocument();

    expect(searchUserList.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("should call onChange with a list of user ids when the user clicks Apply with a selection", async () => {
    const { mockOnChange } = await setup();

    const searchUserList = within(screen.getByTestId("search-user-list"));
    await userEvent.click(searchUserList.getByText("Alice"));
    await userEvent.click(searchUserList.getByText("Bob"));

    await userEvent.click(screen.getByText("Apply"));

    expect(mockOnChange).toHaveBeenCalledWith([1, 2]);
  });

  it("should call onChange with an empty list when the user clicks Apply with no selection", async () => {
    const { mockOnChange } = await setup({
      initialSelectedUsers: TEST_USERS.map(user => user.id),
    });
    const searchUserList = within(screen.getByTestId("search-user-select-box"));
    await userEvent.click(searchUserList.getByText("Alice"));
    await userEvent.click(searchUserList.getByText("Bob"));

    await userEvent.click(screen.getByText("Apply"));
    expect(mockOnChange).toHaveBeenCalledWith([]);
  });
});
