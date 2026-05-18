import { flexRender } from "@tanstack/react-table";
import cx from "classnames";

import { Flex } from "metabase/ui";

import { SelectionCheckbox } from "../SelectionCheckbox";
import { CHECKBOX_COLUMN_WIDTH } from "../constants";
import type {
  SelectionState,
  TreeNodeData,
  TreeTableHeaderProps,
} from "../types";
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
  getSelectionState,
  onHeaderCheckboxClick,
  headerCheckboxAriaLabel,
}: TreeTableHeaderProps<TData>) {
  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  const headerSelectionState: SelectionState = (() => {
    if (rows.length === 0) {
      return "none";
    }
    if (getSelectionState) {
      const states = rows.map(getSelectionState);
      if (states.every((s) => s === "all")) {
        return "all";
      }
      if (states.some((s) => s !== "none")) {
        return "some";
      }
      return "none";
    }
    if (table.getIsAllRowsSelected()) {
      return "all";
    }
    if (table.getIsSomeRowsSelected()) {
      return "some";
    }
    return "none";
  })();

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
              pl="0.75rem"
              style={{
                width: CHECKBOX_COLUMN_WIDTH,
                flexShrink: 0,
                ...styles?.headerCell,
              }}
            >
              {onHeaderCheckboxClick && (
                <SelectionCheckbox
                  isSelected={headerSelectionState === "all"}
                  isSomeSelected={headerSelectionState === "some"}
                  onClick={onHeaderCheckboxClick}
                  ariaLabel={headerCheckboxAriaLabel}
                  className={classNames?.checkbox}
                />
              )}
            </Flex>
          )}
          {headerGroup.headers.map((header, index) => {
            const column = header.column;
            const isSortable = column.getCanSort();
            const sortDirection = column.getIsSorted();
            const isFirstColumn = index === 0;

            const columnStyle = {
              padding: "0.75rem",
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
