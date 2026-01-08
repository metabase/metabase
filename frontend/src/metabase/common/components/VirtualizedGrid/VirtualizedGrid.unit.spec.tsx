import * as ReactVirtual from "@tanstack/react-virtual";

import { render, screen } from "__support__/ui";

import { VirtualizedGrid } from "./VirtualizedGrid";

// Mock @tanstack/react-virtual to simplify testing
jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: jest.fn((config) => {
    const count = config?.count ?? 0;
    // Return virtual items based on the actual count
    const virtualItems =
      count > 0
        ? [
            { index: 0, key: 0, start: 0, size: 80 },
            { index: 1, key: 1, start: 80, size: 80 },
          ].slice(0, count)
        : [];

    return {
      getVirtualItems: jest.fn(() => virtualItems),
      getTotalSize: jest.fn(() => virtualItems.length * 80),
    };
  }),
}));

describe("VirtualizedGrid", () => {
  const mockItems = [
    { key: "item-1", content: <div>Item 1</div> },
    { key: "item-2", content: <div>Item 2</div> },
    { key: "item-3", content: <div>Item 3</div> },
    { key: "item-4", content: <div>Item 4</div> },
    { key: "item-5", content: <div>Item 5</div> },
    { key: "item-6", content: <div>Item 6</div> },
    { key: "item-7", content: <div>Item 7</div> },
    { key: "item-8", content: <div>Item 8</div> },
  ];

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders items in a virtualized grid", () => {
    render(<VirtualizedGrid items={mockItems} />);

    // Since we're mocking the virtualizer to return only 2 rows,
    // we should see all 8 items (2 rows × 4 columns)
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
    expect(screen.getByText("Item 4")).toBeInTheDocument();
    expect(screen.getByText("Item 5")).toBeInTheDocument();
    expect(screen.getByText("Item 6")).toBeInTheDocument();
    expect(screen.getByText("Item 7")).toBeInTheDocument();
    expect(screen.getByText("Item 8")).toBeInTheDocument();
  });

  it("renders empty grid when no items provided", () => {
    render(<VirtualizedGrid items={[]} />);

    // Items should not be in document, but grid structure exists
    expect(screen.queryByText("Item 1")).not.toBeInTheDocument();
  });

  it("applies custom Box props", () => {
    render(<VirtualizedGrid items={mockItems} className="custom-grid-class" />);

    // Verify items are rendered with the custom class applied
    expect(screen.getByText("Item 1")).toBeInTheDocument();
  });

  it("groups items into rows correctly", () => {
    // With 8 items and 4 columns per row, we should have 2 rows
    const useVirtualizerMock = jest.mocked(ReactVirtual.useVirtualizer);

    render(<VirtualizedGrid items={mockItems} columnsPerRow={4} />);

    // Verify useVirtualizer was called with count: 2 (2 rows)
    expect(useVirtualizerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 2, // 8 items / 4 columns = 2 rows
      }),
    );
  });

  it("passes estimated row height to virtualizer", () => {
    const useVirtualizerMock = jest.mocked(ReactVirtual.useVirtualizer);
    const estimatedHeight = 100;

    render(
      <VirtualizedGrid
        items={mockItems}
        estimatedRowHeight={estimatedHeight}
      />,
    );

    expect(useVirtualizerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        estimateSize: expect.any(Function),
      }),
    );

    // Get the estimateSize function and verify it returns the correct height
    const call = useVirtualizerMock.mock.calls[0][0];
    expect(call.estimateSize(0)).toBe(estimatedHeight);
  });

  it("passes overscan prop to virtualizer", () => {
    const useVirtualizerMock = jest.mocked(ReactVirtual.useVirtualizer);
    const overscanValue = 10;

    render(<VirtualizedGrid items={mockItems} overscan={overscanValue} />);

    expect(useVirtualizerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        overscan: overscanValue,
      }),
    );
  });

  it("uses default values for optional props", () => {
    const useVirtualizerMock = jest.mocked(ReactVirtual.useVirtualizer);

    render(<VirtualizedGrid items={mockItems} />);

    expect(useVirtualizerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        overscan: 5, // default overscan
      }),
    );

    // Verify default estimatedRowHeight
    const call = useVirtualizerMock.mock.calls[0][0];
    expect(call.estimateSize(0)).toBe(80); // default estimatedRowHeight
  });

  it("renders all items in the virtualized viewport", () => {
    render(<VirtualizedGrid items={mockItems} />);

    // Verify that all items are rendered in the mocked viewport
    mockItems.forEach((item) => {
      const itemElement = screen.getByText(item.content.props.children);
      expect(itemElement).toBeInTheDocument();
    });
  });
});
