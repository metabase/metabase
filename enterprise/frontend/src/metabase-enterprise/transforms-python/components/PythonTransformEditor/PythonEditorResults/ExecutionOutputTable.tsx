import { useMemo } from "react";

import { DataGrid, useDataGridInstance } from "metabase/data-grid";

import { type Row, parseOutput } from "./utils";

export function ExecutionOutputTable({ output }: { output?: string }) {
  const { headers, rows } = useMemo(() => parseOutput(output ?? ""), [output]);

  const tableProps = useDataGridInstance<Row, unknown>({
    data: rows,
    columnsOptions: headers.map((header) => ({
      id: header,
      name: header,
      accessorFn: (row) => row[header],
    })),
    minGridWidth: 100,
  });

  if (!output || headers.length === 0) {
    return null;
  }

  return <DataGrid {...tableProps} />;
}
