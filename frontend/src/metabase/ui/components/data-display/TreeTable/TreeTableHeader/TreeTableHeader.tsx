import cx from "classnames";

import { Badge, Icon } from "metabase/ui";

import { CHECKBOX_COLUMN_WIDTH } from "../constants";
import type {
  TreeColumnDef,
  TreeNodeData,
  TreeTableInstance,
  TreeTableStylesProps,
} from "../types";

import S from "./TreeTableHeader.module.css";

interface TreeTableHeaderProps<TData extends TreeNodeData> {
  columns: TreeColumnDef<TData>[];
  sorting: TreeTableInstance<TData>["sorting"];
  showCheckboxes: boolean;
  classNames?: TreeTableStylesProps["classNames"];
  styles?: TreeTableStylesProps["styles"];
}

export function TreeTableHeader<TData extends TreeNodeData>({
  columns,
  sorting,
  showCheckboxes,
  classNames,
  styles,
}: TreeTableHeaderProps<TData>) {
  return (
    <div className={cx(S.header, classNames?.header)} style={styles?.header}>
      <div
        className={cx(S.headerRow, classNames?.headerRow)}
        style={styles?.headerRow}
      >
        {showCheckboxes && (
          <div
            className={cx(S.headerCell, classNames?.headerCell)}
            style={{ width: CHECKBOX_COLUMN_WIDTH, ...styles?.headerCell }}
          />
        )}
        {columns.map((column, index) => {
          const isSortable = column.enableSorting ?? false;
          const sortDirection = sorting.getSortDirection(column.id);
          const isSorted = sorting.isSorted(column.id);

          const headerContent =
            typeof column.header === "function"
              ? column.header({
                  sorting: sorting.sorting,
                  isSorted,
                  sortDirection,
                })
              : column.header;

          const hasFixedSize = column.size != null;
          const isFirstColumn = index === 0;
          const columnStyle: React.CSSProperties = {
            ...(hasFixedSize ? { width: column.size, flexShrink: 0 } : {}),
            ...(column.minSize ? { minWidth: column.minSize } : {}),
            ...(column.grow || isFirstColumn ? { flex: 1, minWidth: 0 } : {}),
            ...(!hasFixedSize && !column.grow && !isFirstColumn
              ? { flexShrink: 0 }
              : {}),
            ...styles?.headerCell,
          };

          const showBadge = headerContent != null;

          return (
            <div
              key={column.id}
              className={cx(S.headerCell, classNames?.headerCell)}
              style={columnStyle}
              role={isSortable ? "columnheader" : undefined}
              aria-sort={
                isSorted
                  ? sortDirection === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined
              }
            >
              {showBadge && (
                <Badge
                  onClick={
                    isSortable ? () => sorting.toggleSort(column.id) : undefined
                  }
                  classNames={{
                    root: cx(S.headerBadge, {
                      [S.headerBadgeSortable]: isSortable,
                    }),
                    label: S.headerBadgeLabel,
                  }}
                  rightSection={
                    isSorted ? (
                      <Icon
                        name={
                          sortDirection === "asc" ? "chevronup" : "chevrondown"
                        }
                        size={10}
                      />
                    ) : null
                  }
                >
                  {headerContent}
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
