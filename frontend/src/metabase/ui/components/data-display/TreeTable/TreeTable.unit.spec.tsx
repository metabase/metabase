import userEvent from "@testing-library/user-event";

import {
  fireEvent,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";

import { TreeTable } from "./TreeTable";
import { useTreeTableInstance } from "./hooks";
import type { TreeNodeData, TreeTableColumnDef } from "./types";

interface TestNode extends TreeNodeData {
  id: string;
  name: string;
}

const DATA: TestNode[] = [
  { id: "1", name: "Orders" },
  { id: "2", name: "People" },
];

const SORTABLE_COLUMNS: TreeTableColumnDef<TestNode>[] = [
  {
    id: "name",
    header: "Name",
    enableSorting: true,
    accessorFn: (node) => node.name,
    cell: ({ row }) => <span>{row.original.name}</span>,
  },
];

function setup({
  columns = SORTABLE_COLUMNS,
  onRowActivate,
  onScrollEnd,
}: {
  columns?: TreeTableColumnDef<TestNode>[];
  onRowActivate?: (row: { original: TestNode }) => void;
  onScrollEnd?: () => void;
} = {}) {
  mockGetBoundingClientRect({ width: 200, height: 40 });

  function Container() {
    const instance = useTreeTableInstance<TestNode>({
      data: DATA,
      columns,
      getNodeId: (node) => node.id,
      manualSorting: true,
      onRowActivate,
    });

    return (
      <TreeTable
        instance={instance}
        hierarchical={false}
        ariaLabel="Test table"
        onScrollEnd={onScrollEnd}
      />
    );
  }

  renderWithProviders(<Container />);
}

describe("TreeTable keyboard interaction", () => {
  it("does not activate a previously keyboard-focused row when Enter sorts a column header", async () => {
    const onRowActivate = jest.fn();
    setup({ onRowActivate });

    const grid = screen.getByRole("treegrid", { name: "Test table" });
    grid.focus();
    await userEvent.keyboard("{ArrowDown}");

    const header = screen.getByRole("columnheader", { name: "Name" });
    header.focus();
    await userEvent.keyboard("{Enter}");

    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(onRowActivate).not.toHaveBeenCalled();
  });
});

describe("TreeTable scrolling", () => {
  it("calls onScrollEnd only when the scroll container approaches the end", () => {
    const onScrollEnd = jest.fn();
    setup({ onScrollEnd });

    const scrollContainer = screen.getByTestId("tree-table-scroll-container");

    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1_500 },
      scrollTop: { configurable: true, value: 500, writable: true },
    });
    fireEvent.scroll(scrollContainer);
    expect(onScrollEnd).not.toHaveBeenCalled();

    scrollContainer.scrollTop = 800;
    fireEvent.scroll(scrollContainer);
    expect(onScrollEnd).toHaveBeenCalledTimes(1);
  });
});
