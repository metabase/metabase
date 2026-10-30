import type { Row, RowSelectionState } from "@tanstack/react-table";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";

import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
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

const getNodeId = (node: TestNode) => node.id;

const getRowProps = (row: Row<TestNode>) => ({
  "data-testid": `row-${row.original.id}`,
});

interface SetupOpts {
  columns?: TreeTableColumnDef<TestNode>[];
  onRowActivate?: (row: { original: TestNode }) => void;
  isStatic?: boolean;
}

function setup({
  columns = SORTABLE_COLUMNS,
  onRowActivate,
  isStatic = false,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 200, height: 40 });

  function Container() {
    const instance = useTreeTableInstance<TestNode>({
      data: DATA,
      columns,
      getNodeId,
      manualSorting: true,
      onRowActivate,
    });

    return (
      <TreeTable
        instance={instance}
        hierarchical={false}
        ariaLabel="Test table"
        static={isStatic}
        getRowProps={getRowProps}
      />
    );
  }

  renderWithProviders(<Container />);
}

function setupSelection() {
  mockGetBoundingClientRect({ width: 200, height: 40 });

  function SelectionContainer() {
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const handleRowClick = useCallback(() => {}, []);
    const instance = useTreeTableInstance<TestNode>({
      data: DATA,
      columns: SORTABLE_COLUMNS,
      getNodeId,
      enableRowSelection: true,
      rowSelection,
      onRowSelectionChange: setRowSelection,
    });

    return (
      <TreeTable
        instance={instance}
        hierarchical={false}
        showCheckboxes
        ariaLabel="Test table"
        onRowClick={handleRowClick}
        getRowProps={getRowProps}
      />
    );
  }

  renderWithProviders(<SelectionContainer />);
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

describe("TreeTable static mode", () => {
  it("does not mark a clicked row as active", async () => {
    setup({ isStatic: true });

    const row = screen.getByTestId("row-1");
    await userEvent.click(row);

    expect(row).not.toHaveAttribute("data-keyboard-active");
    expect(row).toHaveAttribute("aria-selected", "false");
    expect(row).not.toHaveFocus();
  });

  it("does not move keyboard focus through rows", async () => {
    const onRowActivate = jest.fn();
    setup({ isStatic: true, onRowActivate });

    const grid = screen.getByRole("treegrid", { name: "Test table" });
    grid.focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByTestId("row-1")).not.toHaveAttribute(
      "data-keyboard-active",
    );
    expect(onRowActivate).not.toHaveBeenCalled();
  });

  it("keeps controls inside cells reachable by keyboard and click", async () => {
    const onAction = jest.fn<void, [string]>();
    const columns: TreeTableColumnDef<TestNode>[] = [
      {
        id: "name",
        header: "Name",
        enableSorting: false,
        cell: ({ row }) => <span>{row.original.name}</span>,
      },
      {
        id: "action",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <button onClick={() => onAction(row.original.id)}>Open</button>
        ),
      },
    ];
    setup({ isStatic: true, columns });

    await userEvent.tab();
    expect(
      within(screen.getByTestId("row-1")).getByRole("button", {
        name: "Open",
      }),
    ).toHaveFocus();

    await userEvent.click(
      within(screen.getByTestId("row-2")).getByRole("button", {
        name: "Open",
      }),
    );
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("2");
  });
});

describe("TreeTable row selection", () => {
  // Every other prop the memoized row receives is stable here, so only the selection change itself can update it
  it("checks a row's checkbox when the row is selected", async () => {
    setupSelection();

    const row = await screen.findByTestId("row-1");
    await userEvent.click(within(row).getByRole("checkbox"));

    expect(within(row).getByRole("checkbox")).toBeChecked();
    expect(
      within(screen.getByTestId("row-2")).getByRole("checkbox"),
    ).not.toBeChecked();
  });
});
