import { flexRender } from "@tanstack/react-table";
import cx from "classnames";

import { Flex } from "metabase/ui";

import { CHECKBOX_COLUMN_WIDTH } from "../constants";
import type { TreeNodeData, TreeTableHeaderProps } from "../types";
import { getColumnStyle } from "../utils";

import { HeaderCell } from "./HeaderCell";
import S from "./TreeTableHeader.module.css";

export function TreeTableHeader<TData extends TreeNodeData>({
  table,
  columnWidths,
  showCheckboxes,
  classNames,
  styles,
  isMeasured = true,
  headerVariant = "pill",
}: TreeTableHeaderProps<TData>) {
  const headerGroups = table.getHeaderGroups();

  return (
    <Flex
      className={cx(S.header, classNames?.header, {
        [S.measuring]: !isMeasured,
      })}
      style={styles?.header}
    >
      {headerGroups.map((headerGroup) => (
        <Flex
          key={headerGroup.id}
          className={cx(S.headerRow, classNames?.headerRow)}
          w="100%"
          style={styles?.headerRow}
        >
          {showCheckboxes && (
            <Flex
              className={cx(S.cell, classNames?.headerCell)}
              align="center"
              p="0.75rem"
              style={{ width: CHECKBOX_COLUMN_WIDTH, ...styles?.headerCell }}
            />
          )}
          {headerGroup.headers.map((header, index) => {
            const column = header.column;
            const isSortable = column.getCanSort();
            const sortDirection = column.getIsSorted();
            const isFirstColumn = index === 0;

            const columnStyle = {
              ...getColumnStyle(columnWidths, column.id, isFirstColumn),
              ...styles?.headerCell,
            };

            const headerContent = header.isPlaceholder
              ? null
              : flexRender(column.columnDef.header, header.getContext());

            if (!headerContent) {
              return (
                <Flex
                  key={header.id}
                  className={cx(S.cell, classNames?.headerCell)}
                  align="center"
                  p="0.75rem"
                  style={columnStyle}
                />
              );
            }

            const sortValue = sortDirection || undefined;

            return (
              <Flex
                key={header.id}
                className={cx(S.cell, classNames?.headerCell)}
                align="center"
                p="0.75rem"
                style={columnStyle}
                role={isSortable ? "columnheader" : undefined}
                aria-sort={
                  sortDirection
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                onClick={
                  isSortable ? column.getToggleSortingHandler() : undefined
                }
              >
                {typeof headerContent === "string" ? (
                  <HeaderCell
                    name={headerContent}
                    sort={sortValue}
                    variant={headerVariant}
                  />
                ) : (
                  headerContent
                )}
              </Flex>
            );
          })}
        </Flex>
      ))}
    </Flex>
  );
}
