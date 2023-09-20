import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockUserListResult } from "metabase-types/api/mocks";
import { UserListElement } from "metabase/search/components/filters/CreatedByFilter/UserListElement";

const TEST_USER_LIST_RESULT = createMockUserListResult({
  common_name: "Alice Johnson",
});

const TEST_NO_NAME_USER_LIST_RESULT = createMockUserListResult({
  first_name: "Dave",
  last_name: "Smith",
  common_name: undefined,
});

const setup = ({ value = TEST_USER_LIST_RESULT, isSelected = false }) => {
  const onClickMock = jest.fn();
  renderWithProviders(
    <UserListElement
      value={value}
      isSelected={isSelected}
      onClick={onClickMock}
    />,
  );
  return { onClickMock };
};

describe("UserListElement", () => {
  it("should render the component with user's common name", () => {
    setup({ isSelected: false });
    expect(screen.getByTestId("user-list-element")).toHaveTextContent(
      "Alice Johnson",
    );
  });

  it("should render the component with user's first and last name if common name is not available", () => {
    setup({
      value: TEST_NO_NAME_USER_LIST_RESULT,
      isSelected: false,
    });
    expect(screen.getByTestId("user-list-element")).toHaveTextContent(
      "Dave Smith",
    );
  });

  it("should call the onClick function when clicked", () => {
    const { onClickMock } = setup({ isSelected: false });

    userEvent.click(screen.getByText("Alice Johnson"));

    expect(onClickMock).toHaveBeenCalledTimes(1);
    expect(onClickMock).toHaveBeenCalledWith(TEST_USER_LIST_RESULT);
  });

  it("should be selected when isSelected is true", () => {
    setup({ isSelected: true });
    expect(screen.getByTestId("user-list-element")).toHaveAttribute(
      "data-is-selected",
      "true",
    );
  });

  it("should not have a color when isSelected is false", () => {
    setup({ isSelected: false });
    expect(screen.getByTestId("user-list-element")).toHaveAttribute(
      "data-is-selected",
      "false",
    );
  });
});
