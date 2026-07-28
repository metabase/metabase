import type { ColumnDef } from "@tanstack/react-table";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";

import { getDataColumn, getIsColumnTruncated } from "./data-column";

const setup = ({
  columnSize,
  measuredColumnSize,
  expandColumn = false,
  truncateWidth = 100,
  columnWrap = false,
}: {
  columnSize: number;
  measuredColumnSize: number;
  expandColumn?: boolean;
  truncateWidth?: number;
  columnWrap?: boolean;
}) => {
  const onExpand = jest.fn();
  const columnOptions = {
    id: "test-column",
    name: "Test Column",
    accessorFn: (row: { value: string }) => row.value,
    wrap: columnWrap,
  };
  const dataColumn = getDataColumn(columnOptions);

  // Mirrors how the hook overlays width-dependent values onto meta
  const column: ColumnDef<{ value: string }, string> = {
    ...dataColumn,
    meta: {
      ...dataColumn.meta,
      isTruncated: getIsColumnTruncated({
        columnId: columnOptions.id,
        columnSizing: { "test-column": columnSize },
        measuredColumnSizing: { "test-column": measuredColumnSize },
        expandedColumns: { "test-column": expandColumn },
        truncateWidth,
      }),
      onExpand,
    },
  };

  // Unjustified type cast. FIXME
  const CellComponent = column.cell as React.ComponentType<{
    getValue: () => string;
    row: { index: number; original: { value: string } };
    column: { columnDef: typeof column };
  }>;

  renderWithProviders(
    <CellComponent
      getValue={() => "test value"}
      row={{ index: 0, original: { value: "test value" } }}
      column={{ columnDef: column }}
    />,
  );

  return { onExpand };
};

describe("getDataColumn", () => {
  describe("expand button", () => {
    it("shows expand button when column is truncated", () => {
      setup({
        columnSize: 150,
        measuredColumnSize: 300,
      });

      expect(screen.getByTestId("expand-column")).toBeInTheDocument();
    });

    it("does not show expand button when column width equals measured width", () => {
      setup({
        columnSize: 200,
        measuredColumnSize: 200,
      });

      expect(screen.queryByTestId("expand-column")).not.toBeInTheDocument();
    });

    it("does not show expand button when column width exceeds measured width", () => {
      setup({
        columnSize: 300,
        measuredColumnSize: 200,
      });

      expect(screen.queryByTestId("expand-column")).not.toBeInTheDocument();
    });

    it("does not show expand button when measured width is below truncate threshold", () => {
      setup({
        columnSize: 50,
        measuredColumnSize: 80,
        truncateWidth: 100,
      });

      expect(screen.queryByTestId("expand-column")).not.toBeInTheDocument();
    });

    it("does not show expand button when column is already expanded", () => {
      setup({
        columnSize: 150,
        measuredColumnSize: 300,
        expandColumn: true,
      });

      expect(screen.queryByTestId("expand-column")).not.toBeInTheDocument();
    });

    it("does not show expand button when wrap is enabled", () => {
      setup({
        columnSize: 150,
        measuredColumnSize: 300,
        columnWrap: true,
      });

      expect(screen.queryByTestId("expand-column")).not.toBeInTheDocument();
    });

    it("calls onExpand when the expand button is clicked", async () => {
      const { onExpand } = setup({
        columnSize: 150,
        measuredColumnSize: 300,
      });

      await userEvent.click(screen.getByTestId("expand-column"));

      expect(onExpand).toHaveBeenCalledWith("test-column", "test value");
    });
  });
});
