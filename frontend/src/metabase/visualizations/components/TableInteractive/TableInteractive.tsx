import "react-data-grid/lib/styles.css";
import DataGrid from "react-data-grid";
import type { FunctionComponent } from "react";

import { getRowHeightForViewMode, prepareColumns } from "./utils";

type TableInteractiveProps = {
  data: { rows: Array<any>; cols: Array<any> };
  viewMode: string;
  height: number;
};

export const TableInteractive: FunctionComponent<TableInteractiveProps> = ({
  data,
  viewMode,
  height,
}) => {
  const { rows, cols } = data;

  const rowHeight = getRowHeightForViewMode(viewMode);
  const columns = prepareColumns(cols);
  return (
    <DataGrid
      columns={columns}
      rows={rows}
      style={{ height }}
      rowHeight={rowHeight}
    />
  );
};
