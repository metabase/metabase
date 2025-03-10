import type {
  CellContext,
  ColumnDef,
  ColumnSizingState,
} from "@tanstack/react-table";
import type React from "react";
import { memo } from "react";

import { BodyCell } from "metabase/data-grid/components/BodyCell/BodyCell";
import { HeaderCell } from "metabase/data-grid/components/HeaderCell/HeaderCell";
import { MIN_COLUMN_WIDTH } from "metabase/data-grid/constants";
import type {
  ColumnOptions,
  ExpandedColumnsState,
} from "metabase/data-grid/types";

const getDefaultCellTemplate = <TRow, TValue>(
  {
    id,
    align,
    getBackgroundColor,
    formatter,
    cellVariant,
    wrap,
    getCellClassName,
    getCellStyle,
  }: ColumnOptions<TRow, TValue>,
  isTruncated: boolean,
  onExpand: (columnName: string, content: React.ReactNode) => void,
) => {
  return function Cell({ getValue, row }: CellContext<TRow, TValue>) {
    const value = getValue();
    const backgroundColor = getBackgroundColor?.(value, row?.index);

    return (
      <BodyCell
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
        className={getCellClassName?.(value, row.index)}
        style={getCellStyle?.(value, row.index)}
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

export const getDataColumn = <TRow, TValue>(
  columnOptions: ColumnOptions<TRow, TValue>,
  columnSizing: ColumnSizingState,
  measuredColumnSizing: ColumnSizingState,
  expandedColumns: ExpandedColumnsState,
  truncateWidth: number,
  onExpand: (columnName: string, content: React.ReactNode) => void,
): ColumnDef<TRow, TValue> => {
  const { id, accessorFn, wrap, cell, header, headerClickTargetSelector } =
    columnOptions;
  const columnWidth = columnSizing[id] ?? 0;
  const measuredColumnWidth = measuredColumnSizing[id] ?? 0;

  const isTruncated =
    !expandedColumns[id] &&
    columnWidth < measuredColumnWidth &&
    measuredColumnWidth > truncateWidth;

  const columnDefinition: ColumnDef<TRow, TValue> = {
    accessorFn,
    id,
    header:
      typeof header !== "string"
        ? memo(header ?? getDefaultHeaderTemplate(columnOptions))
        : header,
    cell:
      typeof cell !== "string"
        ? memo(
            cell ??
              getDefaultCellTemplate(columnOptions, isTruncated, onExpand),
          )
        : cell,
    minSize: MIN_COLUMN_WIDTH,
    enableResizing: true,
    meta: {
      wrap,
      enableReordering: true,
      headerClickTargetSelector,
    },
  };

  return columnDefinition;
};
