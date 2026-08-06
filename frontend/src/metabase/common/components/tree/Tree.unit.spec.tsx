import { setupMockIntersectionObserver } from "__support__/intersection-observer";
import { fireEvent, render, screen } from "__support__/ui";
import { Tree } from "metabase/common/components/tree";

const data = [
  {
    id: 1,
    name: "Item 1",
    icon: "group" as const,
  },
  {
    id: 2,
    name: "Item 2",
    icon: "group" as const,
    children: [
      {
        id: 3,
        name: "Item 3",
        icon: "group" as const,
      },
    ],
  },
];

const nestedData = [
  {
    id: "A",
    name: "A",
    icon: "group" as const,
    children: [{ id: "A1", name: "A1", icon: "group" as const }],
  },
  {
    id: "B",
    name: "B",
    icon: "group" as const,
    children: [{ id: "B1", name: "B1", icon: "group" as const }],
  },
];

describe("Tree", () => {
  it("should render collapsed items when selectedId is not specified", () => {
    render(<Tree data={data} onSelect={jest.fn()} />);
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.queryByText("Item 3")).not.toBeInTheDocument();
  });

  it("expands tree to the selected item", () => {
    render(<Tree data={data} onSelect={jest.fn()} selectedId={3} />);
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
  });

  it("should render expand and collapse items with children", () => {
    render(<Tree data={data} onSelect={jest.fn()} />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    expect(screen.getByText("Item 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.queryByText("Item 3")).not.toBeInTheDocument();
  });

  it("should allow to select items", () => {
    const onSelectMock = jest.fn();
    render(<Tree data={data} onSelect={onSelectMock} />);

    fireEvent.click(screen.getAllByRole("menuitem")[0]);
    expect(onSelectMock).toHaveBeenCalledWith(data[0]);
  });

  describe("lazily loaded nodes", () => {
    const { getObserverOptions } = setupMockIntersectionObserver();
    const ROW_HEIGHT = 32;

    const lazyData = [
      {
        id: 1,
        name: "Item 1",
        icon: "group" as const,
        children: [],
        hasChildren: true,
        childrenLoaded: false,
      },
    ];

    it("should offer an expand toggle before the children are loaded", () => {
      render(<Tree data={lazyData} onSelect={jest.fn()} />);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should show skeletons only once loading has taken a moment", async () => {
      render(<Tree data={lazyData} onSelect={jest.fn()} />);

      expect(
        screen.queryByTestId("tree-node-skeleton"),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button"));

      // Still nothing: a fetch that resolves quickly should never flash placeholder rows.
      expect(
        screen.queryByTestId("tree-node-skeleton"),
      ).not.toBeInTheDocument();

      expect(
        (await screen.findAllByTestId("tree-node-skeleton")).length,
      ).toBeGreaterThan(0);
      expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    });

    it("should replace the skeletons once the children arrive", () => {
      const { rerender } = render(
        <Tree data={lazyData} onSelect={jest.fn()} />,
      );
      fireEvent.click(screen.getByRole("button"));

      rerender(
        <Tree
          data={[
            {
              ...lazyData[0],
              childrenLoaded: true,
              children: [{ id: 2, name: "Item 2", icon: "group" as const }],
            },
          ]}
          onSelect={jest.fn()}
        />,
      );

      expect(
        screen.queryByTestId("tree-node-skeleton"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Item 2")).toBeInTheDocument();
    });

    const renderInScrollBox = (pageSize: number) =>
      render(
        <div style={{ overflowY: "auto", height: 200 }} data-testid="scrollbox">
          <Tree
            data={data}
            onSelect={jest.fn()}
            hasMore
            onLoadMore={jest.fn()}
            loadingMoreIds={new Set()}
            pageSize={pageSize}
            remainingByLevel={new Map([[null, 100]])}
          />
        </div>,
      );

    it("should watch the box the tree scrolls in, not the viewport", () => {
      renderInScrollBox(5);

      // A margin against the viewport buys nothing while a scrolling ancestor clips the sentinel away first.
      expect(getObserverOptions()?.root).toBe(screen.getByTestId("scrollbox"));
    });

    it("should keep loading after the end of the list has scrolled past", () => {
      const PAGE_SIZE = 5;
      renderInScrollBox(PAGE_SIZE);

      // Reaching well above the fold is what lets a list the reader has scrolled past catch up instead of stalling.
      const { rootMargin } = getObserverOptions() ?? {};
      const [top, , bottom] = String(rootMargin).split(" ");
      expect(Number.parseInt(top, 10)).toBeGreaterThan(PAGE_SIZE * ROW_HEIGHT);
      expect(Number.parseInt(bottom, 10)).toBeGreaterThan(0);
    });

    it("should reserve the height of the rows it has not read", () => {
      render(
        <Tree
          data={data}
          onSelect={jest.fn()}
          hasMore
          onLoadMore={jest.fn()}
          loadingMoreIds={new Set()}
          pageSize={5}
          remainingByLevel={new Map([[null, 10]])}
        />,
      );

      expect(screen.getByTestId("tree-reserved-space")).toHaveStyle({
        height: `${10 * ROW_HEIGHT}px`,
      });
    });

    it("should keep the reserved height unchanged while a page loads", async () => {
      const PAGE_SIZE = 5;
      render(
        <Tree
          data={data}
          onSelect={jest.fn()}
          hasMore
          onLoadMore={jest.fn()}
          loadingMoreIds={new Set([null])}
          pageSize={PAGE_SIZE}
          remainingByLevel={new Map([[null, 10]])}
        />,
      );

      // The placeholders stand in the space already reserved rather than adding to it, so the total is still 10 rows
      // and the scrollbar does not move.
      expect(await screen.findAllByTestId("tree-node-skeleton")).toHaveLength(
        PAGE_SIZE,
      );
      expect(screen.getByTestId("tree-reserved-space")).toHaveStyle({
        height: `${(10 - PAGE_SIZE) * ROW_HEIGHT}px`,
      });
    });

    it("should report expansion to an external controller", () => {
      const handleToggleExpand = jest.fn();
      render(
        <Tree
          onSelect={jest.fn()}
          tree={{
            data: lazyData,
            selectedId: undefined,
            expandedIds: new Set(),
            setExpandedIds: jest.fn(),
            handleToggleExpand,
            collapse: jest.fn(),
          }}
        />,
      );

      fireEvent.click(screen.getByRole("button"));

      expect(handleToggleExpand).toHaveBeenCalledWith(1);
      // Expansion is the controller's to grant, so nothing expands until it says so.
      expect(
        screen.queryByTestId("tree-node-skeleton"),
      ).not.toBeInTheDocument();
    });
  });

  it("expands ancestors when selecting a child whose parent was collapsed", () => {
    const { rerender } = render(
      <Tree data={nestedData} onSelect={jest.fn()} selectedId="A1" />,
    );

    expect(screen.getByText("A1")).toBeInTheDocument();

    // Collapse A by clicking its expand button
    const expandButtons = screen.getAllByRole("button");
    fireEvent.click(expandButtons[0]);
    expect(screen.queryByText("A1")).not.toBeInTheDocument();

    // Change selection to B1
    rerender(<Tree data={nestedData} onSelect={jest.fn()} selectedId="B1" />);
    expect(screen.getByText("B1")).toBeInTheDocument();

    // Change selection back to A1 — A should re-expand
    rerender(<Tree data={nestedData} onSelect={jest.fn()} selectedId="A1" />);
    expect(screen.getByText("A1")).toBeInTheDocument();
  });
});
