import { useMemo } from "react";

import { DataGrid, useDataGridInstance } from "metabase/data-grid";

import { parseCSV } from "./utils";

export function ExecutionOutputTable({ output }: { output?: string }) {
  const { headers, rows } = useMemo(() => parseCSV(output || ""), [output]);

  const tableProps = useDataGridInstance<string[], unknown>({
    data: rows,
    columnsOptions: headers.map((header, index) => ({
      id: header,
      name: header,
      accessorFn: (row) => row[index],
    })),
    minGridWidth: 100,
  });

  if (!output || headers.length === 0) {
    return null;
  }

  return <DataGrid {...tableProps} />;
}
