import { DataGrid, useDataGridInstance } from "metabase/data-grid";
import { formatValue } from "metabase/lib/formatting";
import type { PythonExecutionResult } from "metabase-enterprise/transforms-python/services/pyodide-worker";
import type { RowValue } from "metabase-types/api";

export type Row = Record<string, RowValue>;

export function ExecutionOutputTable({
  output,
}: {
  output?: PythonExecutionResult;
}) {
  const { columns = [], data = [] } = output ?? {};

  const tableProps = useDataGridInstance<Row, unknown>({
    data,
    columnsOptions: columns.map((column) => ({
      id: column,
      name: column,
      accessorFn: (row) => row[column],
      formatter: (value) => {
        return formatValue(value, {
          type: "cell",
          jsx: true,
          rich: true,
        });
      },
    })),
  });

  if (!output || columns.length === 0) {
    return null;
  }

  return <DataGrid {...tableProps} />;
}
