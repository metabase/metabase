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

    it("should report expansion to the owner when controlled", () => {
      const onToggleExpand = jest.fn();
      render(
        <Tree
          data={lazyData}
          onSelect={jest.fn()}
          expandedIds={new Set()}
          onToggleExpand={onToggleExpand}
        />,
      );

      fireEvent.click(screen.getByRole("button"));

      expect(onToggleExpand).toHaveBeenCalledWith(1);
      // Expansion is the owner's to grant, so nothing expands until they say so.
      expect(
        screen.queryByTestId("tree-node-skeleton"),
      ).not.toBeInTheDocument();
    });
  });
});
