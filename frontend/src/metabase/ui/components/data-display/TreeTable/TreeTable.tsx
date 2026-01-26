import type { Row } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import cx from "classnames";
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import {
  Box,
  Center,
  Flex,
  type TreeTableRowPinnedPosition,
} from "metabase/ui";

import S from "./TreeTable.module.css";
import { TreeTableHeader } from "./TreeTableHeader";
import { TreeTableRow } from "./TreeTableRow";
import { CHECKBOX_COLUMN_WIDTH, DEFAULT_INDENT_WIDTH } from "./constants";
import type { TreeNodeData, TreeTableProps } from "./types";

export function TreeTable<TData extends TreeNodeData>({
  instance,
  showCheckboxes = false,
  indentWidth = DEFAULT_INDENT_WIDTH,
  headerVariant = "pill",
  emptyState,
  onRowClick,
  onRowDoubleClick,
  getSelectionState,
  onCheckboxClick,
  isChildrenLoading,
  isRowDisabled,
  getRowProps,
  getRowHref,
  classNames,
  styles,
  ariaLabel,
  ariaLabelledBy,
}: TreeTableProps<TData>) {
  const {
    table,
    rows,
    topPinnedRows,
    centerRows,
    bottomPinnedRows,
    virtualRows,
    totalSize,
    virtualizer,
    containerRef,
    columnWidths,
    isMeasured,
    setContainerWidth,
    handleKeyDown,
    activeRowId,
    setActiveRowId,
    selectedRowId,
  } = instance;

  const rootRef = useRef<HTMLDivElement>(null);

  const handleKeyDownWithFocus = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      handleKeyDown(event);
      // Ensure focus stays on root after keyboard navigation
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        rootRef.current?.focus();
      }
    },
    [handleKeyDown],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const width = container.clientWidth - 1;
      const adjustedWidth = showCheckboxes
        ? width - CHECKBOX_COLUMN_WIDTH
        : width;
      setContainerWidth(adjustedWidth);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, setContainerWidth, showCheckboxes]);

  const hasExpandableNodes = useMemo(
    () => rows.some((row) => row.getCanExpand()),
    [rows],
  );

  const totalContentWidth = useMemo(() => {
    const columnsWidth = Object.values(columnWidths).reduce(
      (sum, w) => sum + w,
      0,
    );
    return showCheckboxes ? columnsWidth + CHECKBOX_COLUMN_WIDTH : columnsWidth;
  }, [columnWidths, showCheckboxes]);

  const measureElement = useCallback(
    (element: HTMLElement | null) => {
      if (element?.isConnected) {
        virtualizer.measureElement(element);
      }
    },
    [virtualizer],
  );

  const handleRowClick = useCallback(
    (row: Row<TData>, event: MouseEvent) => {
      setActiveRowId(row.id);
      onRowClick?.(row, event);
    },
    [setActiveRowId, onRowClick],
  );

  const showEmptyState = rows.length === 0 && emptyState;

  const renderRow = (
    row: Row<TData>,
    index: number,
    virtualItemOrPinnedPosition: VirtualItem | TreeTableRowPinnedPosition,
  ) => (
    <TreeTableRow<TData>
      key={row.id}
      row={row}
      rowIndex={index}
      virtualItemOrPinnedPosition={virtualItemOrPinnedPosition}
      table={table}
      columnWidths={columnWidths}
      showCheckboxes={showCheckboxes}
      showExpandButtons={hasExpandableNodes}
      indentWidth={indentWidth}
      activeRowId={activeRowId}
      selectedRowId={selectedRowId}
      isExpanded={row.getIsExpanded()}
      canExpand={row.getCanExpand()}
      measureElement={measureElement}
      onRowClick={handleRowClick}
      onRowDoubleClick={onRowDoubleClick}
      isDisabled={isRowDisabled?.(row)}
      isChildrenLoading={isChildrenLoading?.(row)}
      getSelectionState={getSelectionState}
      onCheckboxClick={onCheckboxClick}
      classNames={classNames}
      styles={styles}
      getRowProps={getRowProps}
      href={getRowHref?.(row)}
    />
  );

  return (
    <Flex
      ref={rootRef}
      className={cx(S.root, classNames?.root)}
      style={styles?.root}
      direction="column"
      flex={1}
      mih={0}
      w="100%"
      role="treegrid"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onKeyDown={handleKeyDownWithFocus}
    >
      <Box
        ref={containerRef}
        className={cx(S.body, classNames?.body, { [S.measuring]: !isMeasured })}
        flex={1}
        style={styles?.body}
      >
        {showEmptyState ? (
          <Center h="100%" p="xl" c="text-tertiary">
            {emptyState}
          </Center>
        ) : (
          <>
            <Box
              pos="sticky"
              top={0}
              style={{ minWidth: totalContentWidth, zIndex: 1 }}
            >
              <TreeTableHeader
                table={table}
                columnWidths={columnWidths}
                showCheckboxes={showCheckboxes}
                headerVariant={headerVariant}
                classNames={classNames}
                styles={styles}
                isMeasured={isMeasured}
                totalContentWidth={totalContentWidth}
              />
              {topPinnedRows.length > 0 && (
                <Box
                  className={classNames?.pinnedTop}
                  style={{ minWidth: totalContentWidth, ...styles?.pinnedTop }}
                >
                  {topPinnedRows.map((row, index) =>
                    renderRow(row, index, "top"),
                  )}
                </Box>
              )}
            </Box>
            <Box
              pos="relative"
              style={{ height: totalSize, minWidth: totalContentWidth }}
            >
              {virtualRows.map((virtualItem) => {
                const row = centerRows[virtualItem.index];
                if (!row) {
                  return null;
                }
                const rowIndex = topPinnedRows.length + virtualItem.index;
                return renderRow(row, rowIndex, virtualItem);
              })}
            </Box>

            {bottomPinnedRows.length > 0 && (
              <Box
                pos="sticky"
                bottom={0}
                className={classNames?.pinnedBottom}
                style={{ minWidth: totalContentWidth, ...styles?.pinnedBottom }}
              >
                {bottomPinnedRows.map((row, index) => {
                  const rowIndex =
                    topPinnedRows.length + centerRows.length + index;
                  return renderRow(row, rowIndex, "bottom");
                })}
              </Box>
            )}
          </>
        )}
      </Box>
    </Flex>
  );
}
