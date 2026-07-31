import type {
  CellContext,
  ColumnDef,
  ColumnSizingState,
} from "@tanstack/react-table";
import { memo } from "react";

import { BodyCell } from "metabase/data-grid/components/BodyCell/BodyCell";
import { HeaderCell } from "metabase/data-grid/components/HeaderCell/HeaderCell";
import { MIN_COLUMN_WIDTH } from "metabase/data-grid/constants";
import type {
  ColumnOptions,
  ExpandedColumnsState,
} from "metabase/data-grid/types";

const getDefaultCellTemplate = <TRow, TValue>({
  id,
  align,
  getBackgroundColor,
  formatter,
  cellVariant,
  wrap,
  getCellClassName,
  getCellStyle,
  getIsEditing,
  editingCell: EditingCellComponent,
}: ColumnOptions<TRow, TValue>) => {
  return function Cell(
    props: CellContext<TRow, TValue> & { isSelected?: boolean },
  ) {
    const { getValue, row, column, isSelected } = props;
    const value = getValue();
    const backgroundColor = getBackgroundColor?.(value, row?.index);
    const isEditing = getIsEditing?.(id, row.index);
    // Read from column meta so the component identity can stay stable across
    // column width changes (metabase#78557)
    const { isTruncated = false, onExpand } = column.columnDef.meta ?? {};

    if (isEditing && EditingCellComponent) {
      return <EditingCellComponent {...props} />;
    }

    return (
      <BodyCell
        isSelected={isSelected}
        rowIndex={row.index}
        columnId={id}
        value={value}
        align={align}
        canExpand={!wrap && isTruncated}
        formatter={formatter}
        backgroundColor={backgroundColor}
        onExpand={onExpand}
        variant={cellVariant}
        wrap={wrap}
        className={getCellClassName?.(value, row.index, id)}
        style={getCellStyle?.(value, row.index, id)}
      />
    );
  };
};

const getDefaultHeaderTemplate = <TRow, TValue>({
  name,
  align,
  sortDirection,
  headerVariant,
}: ColumnOptions<TRow, TValue>) => {
  return function Header() {
    return (
      <HeaderCell
        name={name}
        align={align}
        sort={sortDirection}
        variant={headerVariant}
      />
    );
  };
};

// getDataColumn always sets the id, unlike tanstack's ColumnDef where it is optional
export type DataColumnDef<TRow, TValue> = ColumnDef<TRow, TValue> & {
  id: string;
};

type ColumnTruncationOptions = {
  columnId: string;
  columnSizing: ColumnSizingState;
  measuredColumnSizing: ColumnSizingState;
  expandedColumns: ExpandedColumnsState;
  truncateWidth: number;
};

export const getIsColumnTruncated = ({
  columnId,
  columnSizing,
  measuredColumnSizing,
  expandedColumns,
  truncateWidth,
}: ColumnTruncationOptions) => {
  const columnWidth = columnSizing[columnId] ?? 0;
  const measuredColumnWidth = measuredColumnSizing[columnId] ?? 0;

  return (
    !expandedColumns[columnId] &&
    columnWidth < measuredColumnWidth &&
    measuredColumnWidth > truncateWidth
  );
};

export const getDataColumn = <TRow, TValue>(
  columnOptions: ColumnOptions<TRow, TValue>,
): DataColumnDef<TRow, TValue> => {
  const {
    id,
    accessorFn,
    wrap,
    cell,
    header,
    headerClickTargetSelector,
    sortingFn,
  } = columnOptions;

  const columnDefinition: DataColumnDef<TRow, TValue> = {
    accessorFn,
    id,
    ...(sortingFn != null ? { sortingFn } : {}),
    header:
      typeof header !== "string"
        ? memo(header ?? getDefaultHeaderTemplate(columnOptions))
        : header,
    cell:
      typeof cell !== "string"
        ? memo(cell ?? getDefaultCellTemplate(columnOptions))
        : cell,
    minSize: MIN_COLUMN_WIDTH,
    enableResizing: true,
    meta: {
      wrap,
      enableReordering: true,
      enableSelection: true,
      headerClickTargetSelector,
      formatter: columnOptions.formatter,
      clipboardFormatter: columnOptions.clipboardFormatter,
    },
  };

  return columnDefinition;
};
