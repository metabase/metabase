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
    const items = Array.from({ length: 10 }, (_, i) => ({
      key: i,
      content: <div>Item {i}</div>,
    }));

    // eslint-disable-next-line testing-library/no-container
    const { container } = render(
      <VirtualizedGrid items={items} columnsPerRow={4} />,
    );

    // With 10 items and 4 columns per row, we should have 3 rows
    // Need to use container to test actual DOM structure/chunking behavior
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const rows = container.querySelectorAll('[style*="translateY"]');

    // With virtualization + overscan, we should see at least some rows rendered
    expect(rows.length).toBeGreaterThan(0);

    // Each item should have width of 25% (100% / 4 columns)
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const itemContainers = container.querySelectorAll('[style*="width: 25%"]');
    expect(itemContainers.length).toBeGreaterThan(0);
  });

  it("should not render children outside the bounding client rect", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      key: i,
      content: <div>Item {i}</div>,
    }));

    render(<VirtualizedGrid items={items} columnsPerRow={4} />);

    // First items should be visible
    expect(screen.getByText("Item 0")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();

    // Items far down should not be rendered due to virtualization
    expect(screen.queryByText("Item 98")).not.toBeInTheDocument();
    expect(screen.queryByText("Item 99")).not.toBeInTheDocument();
  });
});
