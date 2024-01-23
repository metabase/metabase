import "react-data-grid/lib/styles.css";
import DataGrid from "react-data-grid";
import type { FunctionComponent } from "react";
import type { Row } from "react-data-grid";

type TableInteractiveProps = {
  data: { rows: Array<any>; cols: Array<any> };
  viewMode: string;
  height: number;
};

const defaultRenderer = (row: Row) => {
  return <div>{row.row[row.column.idx]}</div>;
};

const getRowHeightForViewMode = (viewMode: string) => {
  switch (viewMode) {
    case "cozy":
      return 36;
    case "compact":
      return 24;
    default:
      return 28;
  }
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
