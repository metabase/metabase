import { screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import { renderWithProviders } from "__support__/ui";
import { ThemeProvider } from "metabase/ui";

import { GridLayout } from "./GridLayout";

// Sample items for testing
const testItems = [
  { id: 1, name: "Item 1" },
  { id: 2, name: "Item 2" },
];

// Default props for tests
const defaultProps = {
  items: testItems,
  itemRenderer: ({ item, gridItemWidth, breakpoint, totalNumGridCols }) => (
    <div
      key={item.id}
      data-testid={`item-${item.id}`}
      data-width={gridItemWidth}
      data-breakpoint={breakpoint}
      data-cols={totalNumGridCols}
    >
      {item.id}
    </div>
  ),
  isEditing: false,
  onLayoutChange: jest.fn(),
  breakpoints: { desktop: 992, mobile: 768 },
  layouts: {
    desktop: [
      { i: "1", x: 0, y: 0, w: 2, h: 2 },
      { i: "2", x: 2, y: 0, w: 2, h: 2 },
    ],
    mobile: [
      { i: "1", x: 0, y: 0, w: 1, h: 1 },
      { i: "2", x: 0, y: 1, w: 1, h: 1 },
    ],
  },
  cols: { desktop: 12, mobile: 6 },
  width: 1200,
  margin: {
    desktop: [10, 10] as [number, number],
    mobile: [5, 5] as [number, number],
  },
  rowHeight: 100,
} as ComponentProps<typeof GridLayout>;

describe("GridLayout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.innerHeight
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      writable: true,
    });

    // ReactGridLayout internally uses offsetParent, which is not supported by jsdom
    // This is a workaround to make it work
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
      get() {
        // eslint-disable-next-line testing-library/no-node-access
        return this.parentNode;
      },
    });
  });

  test("renders all items correctly", () => {
    renderWithProviders(
      <ThemeProvider>
        <GridLayout {...defaultProps} />,
      </ThemeProvider>,
    );

    // Check if all items are rendered
    expect(screen.getByTestId("item-1")).toBeInTheDocument();
    expect(screen.getByTestId("item-2")).toBeInTheDocument();
  });
});
