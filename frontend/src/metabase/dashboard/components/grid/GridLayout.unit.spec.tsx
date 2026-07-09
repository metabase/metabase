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

  test("sizes the container to the visible layout, not hidden cards (metabase#65908)", () => {
    // The `layouts` prop includes a hidden card ("3") that sits far down the
    // grid but has no corresponding entry in `items`, so it is never rendered.
    // react-grid-layout syncs its layout with the rendered children and fires
    // onLayoutChange with only the visible cards. The container height must
    // reflect that visible layout, otherwise empty/hidden cards make the
    // dashboard taller than expected.
    const rowHeight = 100;
    const verticalMargin = 10;

    const props = {
      ...defaultProps,
      isEditing: false,
      rowHeight,
      layouts: {
        desktop: [
          { i: "1", x: 0, y: 0, w: 2, h: 2 },
          { i: "2", x: 2, y: 0, w: 2, h: 2 },
          // Hidden card far down the grid — present in `layouts` but not `items`
          { i: "3", x: 0, y: 100, w: 2, h: 2 },
        ],
        mobile: [
          { i: "1", x: 0, y: 0, w: 1, h: 1 },
          { i: "2", x: 0, y: 1, w: 1, h: 1 },
        ],
      },
    } as ComponentProps<typeof GridLayout>;

    const { container } = renderWithProviders(
      <ThemeProvider>
        <GridLayout {...props} />
      </ThemeProvider>,
    );

    // The visible cards ("1" and "2") occupy rows 0..2, so the lowest cell
    // point is 2. Height = (rowHeight + verticalMargin) * lowestCellPoint.
    const visibleLowestCellPoint = 2;
    const expectedHeight =
      (rowHeight + verticalMargin) * visibleLowestCellPoint;

    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
    const grid = container.querySelector(".react-grid-layout") as HTMLElement;
    expect(grid).not.toBeNull();
    // If the hidden card ("3", y+h = 102) leaked into the height calc, this
    // would be (100 + 10) * 102 = 11220px instead.
    expect(grid).toHaveStyle({ height: `${expectedHeight}px` });
  });
});
