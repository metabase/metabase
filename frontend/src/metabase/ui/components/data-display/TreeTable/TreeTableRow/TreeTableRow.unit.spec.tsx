import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { useTreeTableInstance } from "../hooks";
import type { TreeNodeData, TreeTableColumnDef } from "../types";

import { TreeTableRow } from "./TreeTableRow";

interface TestNode extends TreeNodeData {
  id: string;
  name: string;
}

const DATA: TestNode[] = [{ id: "1", name: "Orders" }];

const COLUMNS: TreeTableColumnDef<TestNode>[] = [
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => <span>{row.original.name}</span>,
  },
];

interface SetupOpts {
  isDisabled?: boolean;
  enableRowSelection?: boolean;
  onCheckboxClick?: (index: number) => void;
}

function setup({
  isDisabled,
  enableRowSelection = true,
  onCheckboxClick,
}: SetupOpts = {}) {
  function Harness() {
    const instance = useTreeTableInstance({
      data: DATA,
      columns: COLUMNS,
      getNodeId: (node) => node.id,
      enableRowSelection,
    });
    const row = instance.rows[0];
    const selectedIds = Object.keys(instance.table.getState().rowSelection);

    return (
      <>
        <div data-testid="selected-ids">{selectedIds.join(",")}</div>
        <TreeTableRow
          row={row}
          rowIndex={0}
          // Pinned position renders without the virtualizer, which does not
          // measure in jsdom.
          virtualItemOrPinnedPosition="top"
          table={instance.table}
          columnWidths={instance.columnWidths}
          showCheckboxes
          showExpandButtons={false}
          indentWidth={20}
          activeRowId={null}
          selectedRowId={null}
          isExpanded={false}
          canExpand={false}
          measureElement={() => {}}
          isDisabled={isDisabled}
          onCheckboxClick={
            onCheckboxClick ? (r, index) => onCheckboxClick(index) : undefined
          }
          hierarchical={false}
        />
      </>
    );
  }

  renderWithProviders(<Harness />);
}

function getCheckboxWrapper() {
  // The checkbox column wrapper (padding around the checkbox) is the first
  // child of the row. Clicking it must behave like clicking the checkbox.
  return screen.getByRole("row").firstElementChild as HTMLElement;
}

describe("TreeTableRow checkbox wrapper", () => {
  it("does not fire onCheckboxClick when the row is disabled", async () => {
    const onCheckboxClick = jest.fn();
    setup({ isDisabled: true, onCheckboxClick });

    await userEvent.click(getCheckboxWrapper());

    expect(onCheckboxClick).not.toHaveBeenCalled();
  });

  it("does not toggle selection via the default path when the row is disabled", async () => {
    setup({ isDisabled: true });

    expect(screen.getByTestId("selected-ids")).toBeEmptyDOMElement();

    await userEvent.click(getCheckboxWrapper());

    expect(screen.getByTestId("selected-ids")).toBeEmptyDOMElement();
  });

  it("fires onCheckboxClick on a wrapper click for an enabled row", async () => {
    const onCheckboxClick = jest.fn();
    setup({ onCheckboxClick });

    await userEvent.click(getCheckboxWrapper());

    expect(onCheckboxClick).toHaveBeenCalledWith(0);
  });

  it("toggles selection on a wrapper click for an enabled row", async () => {
    setup();

    expect(screen.getByTestId("selected-ids")).toBeEmptyDOMElement();

    await userEvent.click(getCheckboxWrapper());

    expect(screen.getByTestId("selected-ids")).toHaveTextContent("1");
  });

  it("does not fire onCheckboxClick when the row cannot be selected", async () => {
    const onCheckboxClick = jest.fn();
    // enableRowSelection false makes row.getCanSelect() return false; without a
    // getSelectionState override the checkbox (and wrapper) must be disabled.
    setup({ enableRowSelection: false, onCheckboxClick });

    await userEvent.click(getCheckboxWrapper());

    expect(onCheckboxClick).not.toHaveBeenCalled();
  });
});
