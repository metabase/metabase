import { screen, render } from "@testing-library/react";

import { mockGetBoundingClientRect } from "__support__/ui";

import { VirtualizedList } from "./VariableHeightVirtualizedList";

describe("VariableHeightVirtualizedList", () => {
  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should render visible children", () => {
    render(
      <VirtualizedList>
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
        <div>Item 4</div>
        <div>Item 5</div>
        <div>Item 7</div>
        <div>Item 8</div>
        <div>Item 8</div>
        <div>Item 9</div>
        <div>Item 10</div>
      </VirtualizedList>,
    );

    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
  });

  it("should not render children outside the bounding client rect", () => {
    render(
      <VirtualizedList>
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
        <div>Item 4</div>
        <div>Item 5</div>
        <div>Item 7</div>
        <div>Item 8</div>
        <div>Item 8</div>
        <div>Item 9</div>
        <div>Item 10</div>
      </VirtualizedList>,
    );

    expect(screen.queryByText("Item 9")).not.toBeInTheDocument();
    expect(screen.queryByText("Item 10")).not.toBeInTheDocument();
  });
});
