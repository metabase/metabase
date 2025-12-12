import cx from "classnames";
import type { MouseEvent } from "react";

import { ExpandButton } from "../ExpandButton";
import { SelectionCheckbox } from "../SelectionCheckbox";
import type {
  FlatTreeNode,
  SelectionState,
  TreeColumnDef,
  TreeNodeData,
  TreeTableInstance,
  TreeTableStylesProps,
} from "../types";

import S from "./TreeTableRow.module.css";

interface TreeTableRowProps<TData extends TreeNodeData> {
  node: FlatTreeNode<TData>;
  virtualStart: number;
  virtualIndex: number;
  columns: TreeColumnDef<TData>[];
  selection: TreeTableInstance<TData>["selection"];
  keyboard: TreeTableInstance<TData>["keyboard"];
  showCheckboxes: boolean;
  indentWidth: number;
  measureElement: (element: HTMLElement | null) => void;
  onRowClick: (node: FlatTreeNode<TData>, event: MouseEvent) => void;
  onRowDoubleClick: (node: FlatTreeNode<TData>, event: MouseEvent) => void;
  onExpandClick: (node: FlatTreeNode<TData>, event: MouseEvent) => void;
  onCheckboxClick: (
    node: FlatTreeNode<TData>,
    index: number,
    event: MouseEvent,
  ) => void;
  getSelectionState?: (node: FlatTreeNode<TData>) => SelectionState;
  isChildrenLoading?: (node: FlatTreeNode<TData>) => boolean;
  classNames?: TreeTableStylesProps["classNames"];
  styles?: TreeTableStylesProps["styles"];
}

export function TreeTableRow<TData extends TreeNodeData>({
  node,
  virtualStart,
  virtualIndex,
  columns,
  selection,
  keyboard,
  showCheckboxes,
  indentWidth,
  measureElement,
  onRowClick,
  onRowDoubleClick,
  onExpandClick,
  onCheckboxClick,
  getSelectionState: customGetSelectionState,
  isChildrenLoading,
  classNames,
  styles,
}: TreeTableRowProps<TData>) {
  const isActive = keyboard.activeId === node.id;
  const selectionState = customGetSelectionState
    ? customGetSelectionState(node)
    : selection.getSelectionState(node);
  const indent = node.depth * indentWidth;
  const childrenLoading = isChildrenLoading?.(node) ?? false;

  return (
    <div
      role="row"
      tabIndex={node.isDisabled ? -1 : isActive ? 0 : -1}
      data-index={virtualIndex}
      ref={measureElement}
      className={cx(S.row, classNames?.row, {
        [S.rowActive]: isActive,
        [classNames?.rowActive ?? ""]: isActive && classNames?.rowActive,
        [S.rowDisabled]: node.isDisabled,
      })}
      style={{
        transform: `translateY(${virtualStart}px)`,
        ...styles?.row,
      }}
      aria-expanded={node.hasChildren ? node.isExpanded : undefined}
      aria-selected={selectionState !== "none"}
      aria-level={node.depth + 1}
      onClick={(e) => onRowClick(node, e)}
      onDoubleClick={(e) => onRowDoubleClick(node, e)}
    >
      {showCheckboxes && (
        <div className={S.checkboxWrapper}>
          <SelectionCheckbox
            selectionState={selectionState}
            disabled={node.isDisabled}
            onClick={(e) => onCheckboxClick(node, virtualIndex, e)}
            className={classNames?.checkbox}
          />
        </div>
      )}
      {columns.map((column, colIndex) => {
        const value = column.accessorFn
          ? column.accessorFn(node.data)
          : column.accessorKey
            ? node.data[column.accessorKey]
            : undefined;

        const cellContent = column.cell
          ? column.cell({ node, value })
          : value != null
            ? String(value)
            : null;

        if (colIndex === 0) {
          const basePadding = 16;
          const columnStyle: React.CSSProperties = {
            paddingLeft: basePadding + indent,
            ...(column.size ? { width: column.size, flexShrink: 0 } : {}),
            ...(column.minSize ? { minWidth: column.minSize } : {}),
            flex: 1,
            minWidth: 0,
            ...styles?.treeCell,
          };

          return (
            <div
              key={column.id}
              role="gridcell"
              className={cx(S.treeCell, classNames?.treeCell)}
              style={columnStyle}
            >
              <ExpandButton
                hasChildren={node.hasChildren}
                isExpanded={node.isExpanded}
                isLoading={childrenLoading}
                onClick={(e) => onExpandClick(node, e)}
                className={classNames?.expandButton}
              />
              <div
                className={cx(S.treeCellContent, classNames?.treeCellContent)}
              >
                {cellContent}
              </div>
            </div>
          );
        }

        const hasFixedSize = column.size != null;
        const columnStyle: React.CSSProperties = {
          ...(hasFixedSize ? { width: column.size, flexShrink: 0 } : {}),
          ...(column.minSize ? { minWidth: column.minSize } : {}),
          ...(column.grow ? { flex: 1, minWidth: 0 } : {}),
          ...(!hasFixedSize && !column.grow ? { flexShrink: 0 } : {}),
          ...styles?.cell,
        };

        return (
          <div
            key={column.id}
            role="gridcell"
            className={cx(S.cell, classNames?.cell)}
            style={columnStyle}
          >
            {cellContent}
          </div>
        );
      })}
    </div>
  );
}
