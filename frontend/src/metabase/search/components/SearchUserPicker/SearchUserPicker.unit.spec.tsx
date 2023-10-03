import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createMockUser } from "metabase-types/api/mocks";
import type { User } from "metabase-types/api";
import { screen, renderWithProviders, waitFor } from "__support__/ui";
import type { CreatedByFilterProps } from "metabase/search/types";
import { setupUsersEndpoints } from "__support__/server-mocks";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker";

const TEST_USERS: User[] = [
  createMockUser({ id: 1, common_name: "Alice" }),
  createMockUser({ id: 2, common_name: "Bob" }),
];

const TestSearchUserPicker = ({ onChange }: { onChange: jest.Func }) => {
  const [value, setValue] = useState<CreatedByFilterProps>([]);
  const onUserChange = (value: CreatedByFilterProps) => {
    setValue(value);
    onChange(value);
  };
  return <SearchUserPicker value={value} onChange={onUserChange} />;
};

const setup = async () => {
  setupUsersEndpoints(TEST_USERS);

  const mockOnChange = jest.fn();
  renderWithProviders(<TestSearchUserPicker onChange={mockOnChange} />);

  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  return { mockOnChange };
};

describe("SearchUserPicker", () => {
  it("displays user list when data is available", async () => {
    await setup();

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("filters users based on input", async () => {
    await setup();

    userEvent.type(screen.getByRole("textbox"), "Alice");

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("should not call onChange when a user is selected", async () => {
    const { mockOnChange } = await setup();

    userEvent.click(screen.getByText("Alice"));

    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it("should call onChange when 'Apply Filters' selected", async () => {
    const { mockOnChange } = await setup();

    userEvent.click(screen.getByText("Alice"));
    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(mockOnChange).toHaveBeenCalledWith(1);
  });
});
