import { useMemo } from "react";

import { Box, Card } from "metabase/ui";

import type { DataCheckRow } from "../../types";
import { formatDataCheckCellValue, getDataCheckRowColumns } from "../../utils";

import S from "./DataCheckRowsTable.module.css";

type DataCheckRowsTableProps = {
  rows: readonly DataCheckRow[];
  ariaLabel: string;
  highlightedColumns?: readonly string[];
  columnLabels?: Readonly<Record<string, string>>;
};

export function DataCheckRowsTable({
  rows,
  ariaLabel,
  highlightedColumns = [],
  columnLabels = {},
}: DataCheckRowsTableProps) {
  const columns = useMemo(() => getDataCheckRowColumns(rows), [rows]);
  const isHighlighted = (column: string) =>
    highlightedColumns.includes(column) ? true : undefined;

  return (
    <Card withBorder shadow="none" p={0}>
      <Box style={{ overflowX: "auto" }}>
        <table className={S.table} aria-label={ariaLabel}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} data-highlighted={isHighlighted(column)}>
                  {columnLabels[column] ?? column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td
                    key={column}
                    data-highlighted={isHighlighted(column)}
                    data-null={row[column] == null ? true : undefined}
                  >
                    {formatDataCheckCellValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Card>
  );
}
