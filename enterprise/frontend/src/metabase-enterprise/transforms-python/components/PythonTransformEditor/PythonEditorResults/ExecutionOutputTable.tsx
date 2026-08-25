import { useMemo } from "react";

import {
  type ColumnOptions,
  DataGrid,
  useDataGridInstance,
} from "metabase/data-grid";
import { formatValue } from "metabase/visualizations/lib/formatting";
import type { RowValue, TestPythonTransformResponse } from "metabase-types/api";

export type Row = Record<string, RowValue>;

type Output = NonNullable<TestPythonTransformResponse["output"]>;

// Stable identities: useDataGridInstance re-syncs its sorted rows whenever
// `data` changes identity, so a fresh [] on every render loops (metabase#78557)
const NO_COLS: Output["cols"] = [];
const NO_ROWS: Output["rows"] = [];

export function ExecutionOutputTable({
  output,
}: {
  output?: TestPythonTransformResponse["output"];
}) {
  const { cols = NO_COLS, rows = NO_ROWS } = output ?? {};

  const columnsOptions = useMemo<ColumnOptions<Row, unknown>[]>(
    () =>
      cols.map((column) => {
        // Convert name to string since DataFrames can haven non-string column names
        const name = (column.name ?? "None").toString();
        return {
          id: name,
          name,
          accessorFn: (row) => row[column.name],
          formatter: (value) => {
            return formatValue(value, {
              type: "cell",
              jsx: true,
              rich: true,
            });
          },
        };
      }),
    [cols],
  );

  const tableProps = useDataGridInstance<Row, unknown>({
    data: rows,
    columnsOptions,
  });

  if (!output || cols.length === 0) {
    return null;
  }

  return <DataGrid {...tableProps} />;
}
