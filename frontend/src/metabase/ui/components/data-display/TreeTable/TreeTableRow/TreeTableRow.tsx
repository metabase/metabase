import { flexRender } from "@tanstack/react-table";
import cx from "classnames";

import { Flex } from "metabase/ui";

import { ExpandButton } from "../ExpandButton";
import { SelectionCheckbox } from "../SelectionCheckbox";
import { TREE_CELL_BASE_PADDING } from "../constants";
import type { TreeNodeData, TreeTableRowProps } from "../types";
import { getColumnStyle } from "../utils";

import S from "./TreeTableRow.module.css";

export function TreeTableRow<TData extends TreeNodeData>({
  row,
  rowIndex,
  virtualItem,
  table,
  columnWidths,
  showCheckboxes,
  showExpandButtons,
  indentWidth,
  activeRowId,
  measureElement,
  onRowClick,
  onRowDoubleClick,
  isDisabled,
  isChildrenLoading,
  getSelectionState,
  onCheckboxClick,
  classNames,
  styles,
}: TreeTableRowProps<TData>) {
  const isActive = activeRowId === row.id;
  const indent = row.depth * indentWidth;
  const visibleCells = row.getVisibleCells();

  const selectionState = getSelectionState
    ? getSelectionState(row)
    : row.getIsSelected()
      ? "all"
      : row.getIsSomeSelected()
        ? "some"
        : "none";

  return (
    <Flex
      role="row"
      tabIndex={isDisabled ? -1 : isActive ? 0 : -1}
      data-index={virtualItem.index}
      ref={measureElement}
      className={cx(S.root, classNames?.row, {
        [S.active]: isActive,
        [classNames?.rowActive ?? ""]: isActive && classNames?.rowActive,
        [S.disabled]: isDisabled,
        [classNames?.rowDisabled ?? ""]: isDisabled && classNames?.rowDisabled,
      })}
      pos="absolute"
      top={0}
      left={0}
      w="100%"
      align="stretch"
      fz="0.875rem"
      lh="1.25rem"
      c="text-primary"
      style={{
        transform: `translateY(${virtualItem.start}px)`,
        ...styles?.row,
      }}
      aria-expanded={row.getCanExpand() ? row.getIsExpanded() : undefined}
      aria-selected={selectionState !== "none"}
      aria-level={row.depth + 1}
      onClick={(e) => onRowClick?.(row, e)}
      onDoubleClick={(e) => onRowDoubleClick?.(row, e)}
    >
      {showCheckboxes && (
        <Flex align="center" pl="0.75rem" className={S.checkboxWrapper}>
          <SelectionCheckbox
            isSelected={selectionState === "all"}
            isSomeSelected={selectionState === "some"}
            disabled={isDisabled || (!getSelectionState && !row.getCanSelect())}
            onClick={(e) => {
              e.stopPropagation();
              if (onCheckboxClick) {
                onCheckboxClick(row, rowIndex, e);
              } else {
                row.toggleSelected();
              }
            }}
            className={classNames?.checkbox}
          />
        </Flex>
      )}
      {visibleCells.map((cell, colIndex) => {
        const column = table.getColumn(cell.column.id);
        const columnDef = column?.columnDef;

        const cellContent = flexRender(columnDef?.cell, cell.getContext());

        if (colIndex === 0) {
          return (
            <Flex
              key={cell.id}
              role="gridcell"
              className={cx(S.treeCell, classNames?.treeCell)}
              align="center"
              gap="0.25rem"
              miw={0}
              py="0.75rem"
              pr="0.5rem"
              style={{
                paddingLeft: TREE_CELL_BASE_PADDING + indent,
                ...getColumnStyle(columnWidths, cell.column.id, true),
                ...styles?.treeCell,
              }}
            >
              {showExpandButtons && (
                <ExpandButton
                  canExpand={row.getCanExpand()}
                  isExpanded={row.getIsExpanded()}
                  isLoading={isChildrenLoading}
                  onClick={(e) => {
                    e.stopPropagation();
                    row.toggleExpanded();
                  }}
                  className={classNames?.expandButton}
                />
              )}
              <Flex
                className={classNames?.treeCellContent}
                align="center"
                gap="0.5rem"
                miw={0}
                flex={1}
              >
                {cellContent}
              </Flex>
            </Flex>
          );
        }

        return (
          <Flex
            key={cell.id}
            role="gridcell"
            className={cx(S.cell, classNames?.cell)}
            align="center"
            gap="0.5rem"
            p="0.75rem"
            style={{
              ...getColumnStyle(columnWidths, cell.column.id, false),
              ...styles?.cell,
            }}
          >
            {cellContent}
          </Flex>
        );
      })}
    </Flex>
  );
}
