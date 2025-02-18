import type {
  CellContext,
  ColumnDef,
  ColumnSizingState,
} from "@tanstack/react-table";
import type React from "react";

import { BodyCell } from "metabase/visualizations/components/Table/cell/BodyCell";
import { HeaderCell } from "metabase/visualizations/components/Table/cell/HeaderCell";

import { MIN_COLUMN_WIDTH } from "../constants";
import type { ColumnOptions, ExpandedColumnsState } from "../types";

const getDefaultCellTemplate = <TRow, TValue>(
  {
    id,
    align,
    getBackgroundColor,
    formatter,
    cellVariant,
    wrap,
  }: ColumnOptions<TRow, TValue>,
  isTruncated: boolean,
  onExpand: (columnName: string, content: React.ReactNode) => void,
) => {
  return function Cell({ getValue, row }: CellContext<TRow, TValue>) {
    const value = getValue();
    const backgroundColor = getBackgroundColor?.(value, row?.index);

    return (
      <BodyCell
        columnId={id}
        value={value}
        align={align}
        canExpand={!wrap && isTruncated}
        formatter={formatter}
        backgroundColor={backgroundColor}
        onExpand={onExpand}
        variant={cellVariant}
        wrap={wrap}
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
  const { id, accessorFn, wrap, cell, header } = columnOptions;
  const columnWidth = columnSizing[id] ?? 0;
  const measuredColumnWidth = measuredColumnSizing[id] ?? 0;

  const isTruncated =
    !expandedColumns[id] &&
    columnWidth < measuredColumnWidth &&
    measuredColumnWidth > truncateWidth;

  const columnDefinition: ColumnDef<TRow, TValue> = {
    accessorFn,
    id,
    header: header ?? getDefaultHeaderTemplate(columnOptions),
    cell: cell ?? getDefaultCellTemplate(columnOptions, isTruncated, onExpand),
    minSize: MIN_COLUMN_WIDTH,
    enableResizing: true,
    meta: {
      wrap,
      enableReordering: true,
    },
  };

  return columnDefinition;
};
