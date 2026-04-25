import { mockGetBoundingClientRect, render, screen } from "__support__/ui";

import { VirtualizedGrid } from "./VirtualizedGrid";

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

    // Need to use container to test actual DOM structure/chunking behavior
    // eslint-disable-next-line testing-library/no-container
    const rows = container.querySelectorAll('[style*="translateY"]');

    // With 10 items and 4 columns per row, we should have 3 rows
    expect(rows.length).toBe(3);

    // Each item should be wrapped in a Grid.Col (has class starting with m_)
    // eslint-disable-next-line testing-library/no-container
    const gridCols = container.querySelectorAll('[class*="m_"]');
    expect(gridCols.length).toBe(16);
  });

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
