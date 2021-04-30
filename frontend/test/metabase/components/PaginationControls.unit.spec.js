import "@testing-library/jest-dom/extend-expect";
import React from "react";
import { render, fireEvent } from "@testing-library/react";

import PaginationControls from "metabase/components/PaginationControls";

const DEFAULT_PROPS = {
  page: 0,
  pageSize: 50,
  itemsLength: 25,
  onNextPage: null,
  onPreviousPage: null,
};

const setup = props => {
  const { container, getByTestId } = render(
    <PaginationControls {...DEFAULT_PROPS} {...props} />,
  );

  const previousPageButton = getByTestId("previous-page-btn");
  const nextPageButton = getByTestId("next-page-btn");

  return {
    container,
    previousPageButton,
    nextPageButton,
  };
};

describe("PaginationControls", () => {
  it("should disable pagination buttons when no callbacks provided", () => {
    const { nextPageButton, previousPageButton } = setup();

    expect(nextPageButton).toBeDisabled();
    expect(previousPageButton).toBeDisabled();
  });

  it("should call pagination callbacks when buttons clicked", () => {
    const onNextPageSpy = jest.fn();
    const onPreviousPageSpy = jest.fn();

    const { nextPageButton, previousPageButton } = setup({
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
