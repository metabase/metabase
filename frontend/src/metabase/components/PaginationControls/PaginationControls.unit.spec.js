import { render, fireEvent, screen } from "@testing-library/react";

import PaginationControls from "metabase/components/PaginationControls";

const DEFAULT_PROPS = {
  page: 0,
  pageSize: 50,
  itemsLength: 25,
  onNextPage: null,
  onPreviousPage: null,
};

const setup = props => {
  const { container } = render(
    <PaginationControls {...DEFAULT_PROPS} {...props} />,
  );

  const previousPageButton = screen.queryByLabelText("Previous page");
  const nextPageButton = screen.queryByLabelText("Next page");

  return {
    container,
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
    const { container } = setup({
      total: 25,
      pageSize: 50,
      onNextPage: () => {},
      onPreviousPage: () => {},
    });

    expect(container).toBeEmpty();
  });

  it("should call pagination callbacks when buttons clicked", () => {
    const onNextPageSpy = jest.fn();
    const onPreviousPageSpy = jest.fn();

    const { nextPageButton, previousPageButton } = setup({
      page: 1,
      onNextPage: onNextPageSpy,
      onPreviousPage: onPreviousPageSpy,
    });

    fireEvent.click(nextPageButton);
    expect(onNextPageSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(previousPageButton);
    expect(onPreviousPageSpy).toHaveBeenCalledTimes(1);
  });

  it("should render correct item range for the first page", () => {
    const { container } = setup();
    expect(container).toHaveTextContent("1 - 25");
  });

  it("should render correct item range for not the first page", () => {
    const { container } = setup({ page: 5 });
    expect(container).toHaveTextContent("251 - 275");
  });
});
