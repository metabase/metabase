import "react-data-grid/lib/styles.css";
import DataGrid from "react-data-grid";
import type { FunctionComponent } from "react";
import type { Row } from "react-data-grid";

type TableInteractiveProps = {
  data: { rows: Array<any>; cols: Array<any> };
};

const defaultRenderer = (row: Row) => {
  return <div>{row.row[row.column.idx]}</div>;
};

const prepareColumns = (columns: Array<any>) => {
  return columns.map((col: any) => {
    return {
      ...col,
      resizable: true,
      key: `${col.name}-${col.field}`,
      width: "max-content",
      name: col.display_name,
      frozen: false,
      renderCell: defaultRenderer,
    };
  });
};

export const TableInteractive: FunctionComponent<TableInteractiveProps> = ({
  data,
}) => {
  const { rows, cols } = data;

  const columns = prepareColumns(cols);
  return <DataGrid columns={columns} rows={rows} style={{ height: 532 }} />;
};
