import { screen, render } from "@testing-library/react";

import { VirtualizedList } from "./VariableHeightVirtualizedList";

describe("VariableHeightVirtualizedList", () => {
  beforeEach(() => {
    // jsdom doesn't have getBoundingClientRect, so we need to mock it
    jest
      .spyOn(window.Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => {
        return {
          height: 100,
          width: 200,
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          x: 0,
          y: 0,
          toJSON: () => {},
        };
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
