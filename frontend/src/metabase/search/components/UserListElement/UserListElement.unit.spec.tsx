import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { UserListElement } from "metabase/search/components/UserListElement/index";
import { createMockUserListResult } from "metabase-types/api/mocks";

const TEST_USER_LIST_RESULT = createMockUserListResult({
  common_name: "Alice Johnson",
});

const setup = ({ value = TEST_USER_LIST_RESULT, isSelected = false } = {}) => {
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
    setup();
    expect(screen.getByTestId("user-list-element")).toHaveTextContent(
      "Alice Johnson",
    );
  });

  it("should call the onClick function when clicked", async () => {
    const { onClickMock } = setup();

    await userEvent.click(screen.getByText("Alice Johnson"));

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

  it("should not be selected when isSelected is false", () => {
    setup();
    expect(screen.getByTestId("user-list-element")).toHaveAttribute(
      "data-is-selected",
      "false",
    );
  });
});
