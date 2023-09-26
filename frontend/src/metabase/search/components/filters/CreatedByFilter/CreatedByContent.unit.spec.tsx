import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createMockUser } from "metabase-types/api/mocks";
import type { User } from "metabase-types/api";
import { screen, renderWithProviders, waitFor } from "__support__/ui";
import type { CreatedByFilterProps } from "metabase/search/types";
import { setupUsersEndpoints } from "__support__/server-mocks";
import { CreatedByContent } from "./CreatedByContent";

const TEST_USERS: User[] = [
  createMockUser({ id: 1, common_name: "Alice" }),
  createMockUser({ id: 2, common_name: "Bob" }),
];

const TestCreatedByContent = ({
  onChange,
  onApply,
}: {
  onChange: jest.Func;
  onApply: jest.Func;
}) => {
  const [value, setValue] = useState<CreatedByFilterProps>();
  const onUserChange = (value: CreatedByFilterProps) => {
    setValue(value);
    onChange(value);
  };
  return (
    <CreatedByContent value={value} onChange={onUserChange} onApply={onApply} />
  );
};

const setup = async () => {
  setupUsersEndpoints(TEST_USERS);

  const mockOnChange = jest.fn();
  const mockOnApply = jest.fn();
  renderWithProviders(
    <TestCreatedByContent onChange={mockOnChange} onApply={mockOnApply} />,
  );

  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  return { mockOnChange, mockOnApply };
};

describe("CreatedByContent", () => {
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

  it("calls onChange when a user is selected", async () => {
    const { mockOnChange } = await setup();

    userEvent.click(screen.getByText("Alice"));

    expect(mockOnChange).toHaveBeenCalledWith(1);
  });

  it("calls onApply when 'Apply Filters' selected", async () => {
    const { mockOnApply } = await setup();

    userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(mockOnApply).toHaveBeenCalled();
  });
});
