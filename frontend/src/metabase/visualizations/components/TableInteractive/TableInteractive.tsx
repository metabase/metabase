import "react-data-grid/lib/styles.css";
import DataGrid from "react-data-grid";
import type { FunctionComponent } from "react";

type TableInteractiveProps = {
  data: { rows: Array<any>; cols: Array<any> };
};
export const TableInteractive: FunctionComponent<TableInteractiveProps> = ({
  data,
}) => {
  const { rows, cols } = data;
  return <DataGrid columns={cols} rows={rows} />;
};
