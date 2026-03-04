import type { Row, Table } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import cx from "classnames";
import type { MouseEvent } from "react";
import { memo, useMemo } from "react";
import { Link } from "react-router";

import { Flex } from "metabase/ui";

import { ExpandButton } from "../ExpandButton";
import { SelectionCheckbox } from "../SelectionCheckbox";
import { DEFAULT_ROW_HEIGHT, TREE_CELL_BASE_PADDING } from "../constants";
import type {
  SelectionState,
  TreeNodeData,
  TreeTableRowProps,
  TreeTableStylesProps,
} from "../types";
import { getColumnStyle } from "../utils";

import S from "./TreeTableRow.module.css";

interface TreeTableRowContentProps<TData extends TreeNodeData>
  extends TreeTableStylesProps {
  row: Row<TData>;
  rowIndex: number;
  table: Table<TData>;
  columnWidths: Record<string, number>;
  showCheckboxes: boolean;
  showExpandButtons: boolean;
  indentWidth: number;
  activeRowId: string | null;
  selectedRowId: string | null;
  isDisabled?: boolean;
  isChildrenLoading?: boolean;
  isExpanded: boolean;
  canExpand: boolean;
  getSelectionState?: (row: Row<TData>) => SelectionState;
  onCheckboxClick?: (row: Row<TData>, index: number, event: MouseEvent) => void;
  onRowClick?: (row: Row<TData>, event: MouseEvent) => void;
  onRowDoubleClick?: (row: Row<TData>, event: MouseEvent) => void;
  rowProps?: Record<string, unknown>;
  hierarchical?: boolean;
}

// Memoized component that does not depend on virtualItem for performance reasons
const TreeTableRowContent = memo(function TreeTableRowContent<
  TData extends TreeNodeData,
>({
  row,
  rowIndex,
  table,
  columnWidths,
  showCheckboxes,
  showExpandButtons,
  indentWidth,
  activeRowId,
  selectedRowId,
  isDisabled,
  isChildrenLoading,
  isExpanded,
  canExpand,
  getSelectionState,
  onCheckboxClick,
  onRowClick,
  onRowDoubleClick,
  classNames,
  styles,
  rowProps,
  hierarchical = false,
}: TreeTableRowContentProps<TData>) {
  const isKeyboardFocused = activeRowId === row.id;
  const isSelected = selectedRowId === row.id;
  const isActive = isKeyboardFocused || isSelected;
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
      {...rowProps}
      role="row"
      tabIndex={isDisabled ? -1 : isKeyboardFocused ? 0 : -1}
      data-keyboard-active={isKeyboardFocused ? true : undefined}
      data-disabled={isDisabled ? true : undefined}
      className={cx(S.content, classNames?.row, {
        [S.active]: isActive,
        [classNames?.rowActive ?? ""]: isActive && classNames?.rowActive,
        [S.disabled]: isDisabled,
        [classNames?.rowDisabled ?? ""]: isDisabled && classNames?.rowDisabled,
      })}
      align="stretch"
      h={DEFAULT_ROW_HEIGHT}
      fz="0.875rem"
      lh="1.25rem"
      c="text-primary"
      style={styles?.row}
      aria-expanded={canExpand ? isExpanded : undefined}
      aria-selected={isSelected}
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

        if (colIndex === 0 && hierarchical) {
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
                  canExpand={canExpand}
                  isExpanded={isExpanded}
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
            style={{
              padding: "0.75rem",
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
}) as <TData extends TreeNodeData>(
  props: TreeTableRowContentProps<TData>,
) => JSX.Element;

// Thin wrapper that handles positioning only
export function TreeTableRow<TData extends TreeNodeData>({
  row,
  rowIndex,
  virtualItemOrPinnedPosition,
  table,
  columnWidths,
  showCheckboxes,
  showExpandButtons,
  indentWidth,
  activeRowId,
  selectedRowId,
  isExpanded,
  canExpand,
  measureElement,
  onRowClick,
  onRowDoubleClick,
  isDisabled,
  isChildrenLoading,
  getSelectionState,
  onCheckboxClick,
  classNames,
  styles,
  getRowProps,
  href,
  renderSubRow,
  hierarchical = true,
}: TreeTableRowProps<TData>) {
  const rowProps = useMemo(() => getRowProps?.(row), [getRowProps, row]);

  const content = (
    <TreeTableRowContent
      row={row}
      rowIndex={rowIndex}
      table={table}
      columnWidths={columnWidths}
      showCheckboxes={showCheckboxes}
      showExpandButtons={showExpandButtons}
      indentWidth={indentWidth}
      activeRowId={activeRowId ?? null}
      selectedRowId={selectedRowId ?? null}
      isDisabled={isDisabled}
      isChildrenLoading={isChildrenLoading}
      isExpanded={isExpanded}
      canExpand={canExpand}
      getSelectionState={getSelectionState}
      onCheckboxClick={onCheckboxClick}
      onRowClick={onRowClick}
      onRowDoubleClick={onRowDoubleClick}
      classNames={classNames}
      styles={styles}
      rowProps={rowProps}
      hierarchical={hierarchical}
    />
  );

  const renderContent = () => {
    const subRowContent = renderSubRow?.(row) ?? null;
    return href ? (
      <Link to={href} className={S.link}>
        {content}
        {subRowContent}
      </Link>
    ) : (
      <>
        {content}
        {subRowContent}
      </>
    );
  };

  if (typeof virtualItemOrPinnedPosition === "string") {
    return (
      <div
        data-position={virtualItemOrPinnedPosition}
        className={cx(S.root, S.pinned, {
          [S.hasCenterRows]: table.getCenterRows().length > 0,
          [S.hasTopPinned]: table.getTopRows().length > 0,
        })}
      >
        {renderContent()}
      </div>
    );
  }
  return (
    <div
      ref={measureElement}
      data-index={virtualItemOrPinnedPosition.index}
      className={S.root}
      style={{
        transform: `translateY(${virtualItemOrPinnedPosition.start}px)`,
      }}
    >
      {renderContent()}
    </div>
  );
}
