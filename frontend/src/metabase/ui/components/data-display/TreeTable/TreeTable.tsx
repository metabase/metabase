import cx from "classnames";
import type { MouseEvent } from "react";
import { useCallback } from "react";

import S from "./TreeTable.module.css";
import { TreeTableHeader } from "./TreeTableHeader";
import { TreeTableRow } from "./TreeTableRow";
import { DEFAULT_INDENT_WIDTH } from "./constants";
import type { FlatTreeNode, TreeNodeData, TreeTableProps } from "./types";

export function TreeTable<TData extends TreeNodeData>({
  instance,
  showCheckboxes = false,
  showHeader = true,
  indentWidth = DEFAULT_INDENT_WIDTH,
  emptyState,
  loadingState,
  onRowClick,
  onRowDoubleClick,
  getSelectionState: customGetSelectionState,
  onCheckboxClick: customOnCheckboxClick,
  isChildrenLoading,
  classNames,
  styles,
  ariaLabel,
  ariaLabelledBy,
}: TreeTableProps<TData>) {
  const {
    flatNodes,
    columns,
    expansion,
    selection,
    sorting,
    virtualization,
    keyboard,
  } = instance;

  const { virtualItems, totalSize, measureElement, containerRef } =
    virtualization;

  const handleRowClick = useCallback(
    (node: FlatTreeNode<TData>, event: MouseEvent) => {
      if (node.isDisabled || node.isLoading) {
        return;
      }

      keyboard.setActiveId(node.id);
      onRowClick?.(node, event);
    },
    [keyboard, onRowClick],
  );

  const handleRowDoubleClick = useCallback(
    (node: FlatTreeNode<TData>, event: MouseEvent) => {
      if (node.isDisabled || node.isLoading) {
        return;
      }
      onRowDoubleClick?.(node, event);
    },
    [onRowDoubleClick],
  );

  const handleExpandClick = useCallback(
    (node: FlatTreeNode<TData>, event: MouseEvent) => {
      event.stopPropagation();
      if (node.hasChildren) {
        expansion.toggle(node.id);
      }
    },
    [expansion],
  );

  const handleCheckboxClick = useCallback(
    (node: FlatTreeNode<TData>, index: number, event: MouseEvent) => {
      event.stopPropagation();
      if (customOnCheckboxClick) {
        customOnCheckboxClick(node, index, event);
      } else {
        selection.toggle(node.id, event);
      }
    },
    [selection, customOnCheckboxClick],
  );

  if (flatNodes.length === 0 && emptyState) {
    return (
      <div className={cx(S.root, classNames?.root)} style={styles?.root}>
        <div className={S.emptyState}>{emptyState}</div>
      </div>
    );
  }

  return (
    <div
      className={cx(S.root, classNames?.root)}
      style={styles?.root}
      role="treegrid"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onKeyDown={keyboard.handleKeyDown}
    >
      {showHeader && (
        <TreeTableHeader
          columns={columns}
          sorting={sorting}
          showCheckboxes={showCheckboxes}
          classNames={classNames}
          styles={styles}
        />
      )}

      <div
        ref={containerRef}
        className={cx(S.body, classNames?.body)}
        style={styles?.body}
      >
        <div className={S.bodyInner} style={{ height: totalSize }}>
          {virtualItems.map((virtualItem) => {
            const node = flatNodes[virtualItem.index];
            if (!node) {
              return null;
            }

            if (node.isLoading && loadingState) {
              return (
                <div
                  key={`loading-${node.id}`}
                  className={cx(S.loadingRow, classNames?.loadingRow)}
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                    height: virtualItem.size,
                    ...styles?.loadingRow,
                  }}
                  data-index={virtualItem.index}
                  ref={measureElement}
                >
                  {loadingState}
                </div>
              );
            }

            return (
              <TreeTableRow
                key={node.id}
                node={node}
                virtualStart={virtualItem.start}
                virtualIndex={virtualItem.index}
                columns={columns}
                selection={selection}
                keyboard={keyboard}
                showCheckboxes={showCheckboxes}
                indentWidth={indentWidth}
                measureElement={measureElement}
                onRowClick={handleRowClick}
                onRowDoubleClick={handleRowDoubleClick}
                onExpandClick={handleExpandClick}
                onCheckboxClick={handleCheckboxClick}
                getSelectionState={customGetSelectionState}
                isChildrenLoading={isChildrenLoading}
                classNames={classNames}
                styles={styles}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { TreeTableLoadingRow } from "./TreeTableLoadingRow";
