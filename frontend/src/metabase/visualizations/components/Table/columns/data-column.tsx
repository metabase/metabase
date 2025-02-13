import type {
  CellContext,
  ColumnDef,
  ColumnSizingState,
} from "@tanstack/react-table";
import type React from "react";
import { memo } from "react";

import { BodyCell } from "metabase/visualizations/components/Table/cell/BodyCell";
import { HeaderCell } from "metabase/visualizations/components/Table/cell/HeaderCell";
import { MiniBarCell } from "metabase/visualizations/components/Table/cell/MiniBarCell";

import { MIN_COLUMN_WIDTH } from "../constants";
import type { ColumnOptions } from "../hooks/use-table-instance";
import type { ExpandedColumnsState } from "../types";

export const getDataColumn = <TRow, TValue>(
  columnOptions: ColumnOptions<TRow, TValue>,
  columnSizing: ColumnSizingState,
  measuredColumnSizing: ColumnSizingState,
  expandedColumns: ExpandedColumnsState,
  truncateWidth: number,
  onExpand: (columnName: string, content: React.ReactNode) => void,
): ColumnDef<TRow, TValue> => {
  const {
    id,
    name,
    accessorFn,
    cellVariant,
    align,
    wrap,
    sortDirection,
    getColumnExtent,
    getBackgroundColor,
    formatter = (value: TValue) => String(value),
  } = columnOptions;
  const columnWidth = columnSizing[id] ?? 0;
  const measuredColumnWidth = measuredColumnSizing[id] ?? 0;

  const isTruncated =
    !expandedColumns[id] &&
    columnWidth < measuredColumnWidth &&
    measuredColumnWidth > truncateWidth;

  const columnDefinition: ColumnDef<TRow, TValue> = {
    accessorFn,
    id,
    header: memo(function Header() {
      return <HeaderCell name={name} align={align} sort={sortDirection} />;
    }),
    cell: memo(function Cell({ getValue, row }: CellContext<TRow, TValue>) {
      const value = getValue();
      const backgroundColor = getBackgroundColor(value, row?.index);

      if (cellVariant === "minibar") {
        return (
          <MiniBarCell
            align={align}
            backgroundColor={backgroundColor}
            value={value}
            formatter={formatter}
            extent={getColumnExtent()}
          />
        );
      }

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
    }),
    minSize: MIN_COLUMN_WIDTH,
    enableResizing: true,
    meta: {
      wrap,
      enableReordering: true,
    },
  };

  return columnDefinition;
};
