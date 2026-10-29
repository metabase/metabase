import {
  mockGetBoundingClientRect,
  render,
  screen,
  within,
} from "__support__/ui";

import { VirtualizedGrid } from "./VirtualizedGrid";

function getRenderedRows(container: HTMLElement) {
  // Need to use container to test actual DOM structure/chunking behavior
  const rows = container.querySelectorAll<HTMLDivElement>(
    'div[style*="translateY"]',
  );

  return Array.from(rows, (row) =>
    within(row)
      .getAllByText(/^Item \d+$/)
      .map((item) => item.textContent),
  );
}

describe("VirtualizedGrid", () => {
  beforeEach(() => {
    // Same pattern as metabase/common/components/VirtualizedList/VariableHeightVirtualizedList.unit.spec.tsx
    mockGetBoundingClientRect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should chunk items into grid rows based on columnsPerRow", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i }));

    const { container } = render(
      <VirtualizedGrid
        items={items}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <div>Item {item.id}</div>}
        columnsPerRow={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}
        estimatedRowHeight={80}
      />,
    );

    // With 10 items and 4 columns per row, we should have 3 rows
    expect(getRenderedRows(container)).toEqual([
      ["Item 0", "Item 1", "Item 2", "Item 3"],
      ["Item 4", "Item 5", "Item 6", "Item 7"],
      ["Item 8", "Item 9"],
    ]);
  });

  it.each([
    {
      name: "uneven columns",
      itemCount: 10,
      columnCount: 4,
      expectedRows: [
        ["Item 0", "Item 3", "Item 6", "Item 9"],
        ["Item 1", "Item 4", "Item 7"],
        ["Item 2", "Item 5", "Item 8"],
      ],
    },
    {
      name: "fewer items than columns",
      itemCount: 2,
      columnCount: 4,
      expectedRows: [["Item 0", "Item 1"]],
    },
    {
      name: "an empty list",
      itemCount: 0,
      columnCount: 4,
      expectedRows: [],
    },
  ])(
    "should preserve item order down columns with $name (#83318)",
    ({ itemCount, columnCount, expectedRows }) => {
      const { container } = render(
        <VirtualizedGrid
          items={Array.from({ length: itemCount }, (_, index) => index)}
          keyExtractor={(item) => item}
          renderItem={(item) => <div>Item {item}</div>}
          columnsPerRow={{
            xs: columnCount,
            sm: columnCount,
            md: columnCount,
            lg: columnCount,
            xl: columnCount,
          }}
          estimatedRowHeight={80}
          itemOrder="column"
        />,
      );

      expect(getRenderedRows(container)).toEqual(expectedRows);
    },
  );

  it("should not render children outside the bounding client rect", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));

    render(
      <VirtualizedGrid
        items={items}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <div>Item {item.id}</div>}
        columnsPerRow={{ xs: 4, sm: 4, md: 4, lg: 4, xl: 4 }}
        estimatedRowHeight={80}
      />,
    );

    // First items should be visible
    expect(screen.getByText("Item 0")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();

    // Items far down should not be rendered due to virtualization
    expect(screen.queryByText("Item 98")).not.toBeInTheDocument();
    expect(screen.queryByText("Item 99")).not.toBeInTheDocument();
  });
});
