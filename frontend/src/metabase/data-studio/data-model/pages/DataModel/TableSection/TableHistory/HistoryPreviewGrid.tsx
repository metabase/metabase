import { useMemo } from "react";

import { DataGrid } from "metabase/data-grid";
import { useDataGridInstance } from "metabase/data-grid/hooks/use-data-grid-instance";
import type { ColumnOptions } from "metabase/data-grid/types";
import { Box } from "metabase/ui";

export type PreviewColumn<TRow> = {
  id: string;
  name: string;
  value: (row: TRow) => string | number | boolean | null;
  align?: "left" | "right";
};

interface HistoryPreviewGridProps<TRow> {
  rows: TRow[];
  columns: PreviewColumn<TRow>[];
  onRowClick?: (row: TRow) => void;
}

export function HistoryPreviewGrid<TRow>({
  rows,
  columns,
  onRowClick,
}: HistoryPreviewGridProps<TRow>) {
  const columnsOptions: ColumnOptions<TRow>[] = useMemo(
    () =>
      columns.map((column) => ({
        id: column.id,
        name: column.name,
        accessorFn: column.value,
        align: column.align,
        formatter: (value: unknown) => (value === null ? "" : String(value)),
      })),
    [columns],
  );

  const gridProps = useDataGridInstance({
    data: rows,
    columnsOptions,
  });

  return (
    <Box h="100%" miw={0}>
      <DataGrid
        {...gridProps}
        onBodyCellClick={
          onRowClick
            ? (_event, rowIndex) => {
                const row = rows[rowIndex];
                if (row) {
                  onRowClick(row);
                }
              }
            : undefined
        }
      />
    </Box>
  );
}
