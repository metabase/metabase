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
    // Unjustified type cast. FIXME
    desktop: [10, 10] as [number, number],
    // Unjustified type cast. FIXME
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

  test("sizes the container to the visible layout, not hidden cards (metabase#65908)", () => {
    // Card "3" is in layouts but not in items, like a card hidden for having no results.
    const rowHeight = 100;
    const verticalMargin = 10;

    const props: ComponentProps<typeof GridLayout> = {
      ...defaultProps,
      isEditing: false,
      rowHeight,
      layouts: {
        desktop: [
          { i: "1", x: 0, y: 0, w: 2, h: 2 },
          { i: "2", x: 2, y: 0, w: 2, h: 2 },
          { i: "3", x: 0, y: 100, w: 2, h: 2 },
        ],
        mobile: [
          { i: "1", x: 0, y: 0, w: 1, h: 1 },
          { i: "2", x: 0, y: 1, w: 1, h: 1 },
        ],
      },
    };

    const { container } = renderWithProviders(
      <ThemeProvider>
        <GridLayout {...props} />
      </ThemeProvider>,
    );

    const visibleLowestCellPoint = 2;
    const expectedHeight =
      (rowHeight + verticalMargin) * visibleLowestCellPoint;

    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
    const grid = container.querySelector(".react-grid-layout");
    expect(grid).not.toBeNull();
    expect(grid).toHaveStyle({ height: `${expectedHeight}px` });
  });
});
