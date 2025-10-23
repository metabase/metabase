import { DataGrid, useDataGridInstance } from "metabase/data-grid";
import { formatValue } from "metabase/lib/formatting";
import type { RowValue, TestPythonTransformResponse } from "metabase-types/api";

export type Row = Record<string, RowValue>;

export function ExecutionOutputTable({
  output,
}: {
  output?: TestPythonTransformResponse["output"];
}) {
  const { cols = [], rows = [] } = output ?? {};

  const tableProps = useDataGridInstance<Row, unknown>({
    data: rows,
    columnsOptions: cols.map((column) => ({
      id: column.name,
      name: column.name,
      accessorFn: (row) => row[column.name],
      formatter: (value) => {
        return formatValue(value, {
          type: "cell",
          jsx: true,
          rich: true,
        });
      },
    })),
  });

  if (!output || cols.length === 0) {
    return null;
  }

  return <DataGrid {...tableProps} />;
}
