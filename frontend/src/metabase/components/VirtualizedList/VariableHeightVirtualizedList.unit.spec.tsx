import { screen, render } from "@testing-library/react";

import { VirtualizedList } from "./VariableHeightVirtualizedList";

describe("VariableHeightVirtualizedList", () => {
  beforeEach(() => {
    // jsdom doesn't have getBoundingClientRect, so we need to mock it
    window.Element.prototype.getBoundingClientRect = jest
      .fn()
      .mockImplementation(() => {
        // this will make all elements, the container and the children have the same size
        // so it will render the first 2 children (one beyond visible)
        // and not render the last 2 children
        return { height: 100, width: 200 };
      });
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
      </VirtualizedList>,
    );

    expect(screen.queryByText("Item 3")).not.toBeInTheDocument();
    expect(screen.queryByText("Item 4")).not.toBeInTheDocument();
  });
});
