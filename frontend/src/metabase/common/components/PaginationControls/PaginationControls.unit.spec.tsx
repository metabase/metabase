import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import type { PaginationControlsProps } from "./PaginationControls";
import { PaginationControls } from "./PaginationControls";

const DEFAULT_PROPS: PaginationControlsProps = {
  page: 0,
  pageSize: 50,
  itemsLength: 25,
  onNextPage: null,
  onPreviousPage: null,
};

const setup = (props: Partial<PaginationControlsProps> = {}) => {
  render(
    <div data-testid="test-container">
      <PaginationControls {...DEFAULT_PROPS} {...props} />
    </div>,
  );

  const previousPageButton = screen.queryByLabelText("Previous page");
  const nextPageButton = screen.queryByLabelText("Next page");

  return {
    previousPageButton,
    nextPageButton,
  };
};

describe("PaginationControls", () => {
  it("should disable pagination buttons when no callbacks provided and no total provided", () => {
    const { nextPageButton, previousPageButton } = setup();

    expect(nextPageButton).toBeDisabled();
    expect(previousPageButton).toBeDisabled();
  });

  it("should disable pagination button on the first page", () => {
    const { nextPageButton, previousPageButton } = setup({
      total: 150,
      page: 0,
      pageSize: 50,
      onNextPage: () => {},
      onPreviousPage: () => {},
    });

    expect(previousPageButton).toBeDisabled();
    expect(nextPageButton).toBeEnabled();
  });

  it("should disable pagination button on the last page when total is provided", () => {
    const { nextPageButton, previousPageButton } = setup({
      total: 150,
      page: 2,
      pageSize: 50,
      onNextPage: () => {},
      onPreviousPage: () => {},
    });

    expect(previousPageButton).toBeEnabled();
    expect(nextPageButton).toBeDisabled();
  });

  it("should return null when total is provided and it is less than page size", () => {
    setup({
      total: 25,
      pageSize: 50,
      onNextPage: () => {},
      onPreviousPage: () => {},
    });
    const container = screen.getByTestId("test-container");

    expect(container).toBeEmptyDOMElement();
  });

  it("should call pagination callbacks when buttons clicked", async () => {
    const onNextPageSpy = jest.fn();
    const onPreviousPageSpy = jest.fn();

    const { nextPageButton, previousPageButton } = setup({
      page: 1,
      onNextPage: onNextPageSpy,
      onPreviousPage: onPreviousPageSpy,
    });

    if (nextPageButton) {
      await userEvent.click(nextPageButton);
    }
    expect(onNextPageSpy).toHaveBeenCalledTimes(1);

    if (previousPageButton) {
      await userEvent.click(previousPageButton);
    }
    expect(onPreviousPageSpy).toHaveBeenCalledTimes(1);
  });

  it("should render correct item range for the first page", () => {
    setup();
    const container = screen.getByTestId("test-container");
    expect(container).toHaveTextContent("1 - 25");
  });

  it("should render correct item range for not the first page", () => {
    setup({ page: 5 });
    const container = screen.getByTestId("test-container");
    expect(container).toHaveTextContent("251 - 275");
  });
});
