import { useMemo } from "react";

import {
  type ColumnOptions,
  DataGrid,
  useDataGridInstance,
} from "metabase/data-grid";

import { type Row, parseOutput } from "./utils";

export function ExecutionOutputTable({ output }: { output?: string }) {
  const { headers, rows } = useMemo(() => parseOutput(output ?? ""), [output]);

  const columnsOptions = useMemo<ColumnOptions<Row, unknown>[]>(
    () =>
      headers.map((header) => ({
        id: header,
        name: header,
        accessorFn: (row) => row[header],
      })),
    [headers],
  );

  const tableProps = useDataGridInstance<Row, unknown>({
    data: rows,
    columnsOptions,
    minGridWidth: 100,
  });

  if (!output || headers.length === 0) {
    return null;
  }

  return <DataGrid {...tableProps} />;
}
