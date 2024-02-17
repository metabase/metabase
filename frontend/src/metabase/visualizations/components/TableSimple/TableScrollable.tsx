import { useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";
import { Ellipsified } from "metabase/core/components/Ellipsified";

import { isColumnRightAligned } from "metabase/visualizations/lib/table";

import type { TableSimpleProps } from "./types";
import { useSimpleTable } from "./useSimpleTable";
import { TableCell } from "./TableCell";
import {
  Root,
  ContentContainer,
  Table,
  TableContainer,
  TableHeaderCellContent,
  SortIcon,
} from "./TableSimple.styled";

function TableScrollableInner({
  data,
  series,
  settings,
  height,
  isPivoted,
  className,
  onVisualizationClick,
  visualizationIsClickable,
  getColumnTitle,
  getExtraDataForClick,
}: TableSimpleProps) {
  const {
    rowIndexes,
    sortColumn,
    sortDirection,
    setSort,
    getCellBackgroundColor,
  } = useSimpleTable({ data, settings });

  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: data.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  const checkIsVisualizationClickable = useCallback(
    clickedItem => {
      return Boolean(
        onVisualizationClick &&
          visualizationIsClickable &&
          visualizationIsClickable(clickedItem),
      );
    },
    [onVisualizationClick, visualizationIsClickable],
  );

  const renderColumnHeader = useCallback(
    (col, colIndex) => {
      const iconName = sortDirection === "desc" ? "chevrondown" : "chevronup";
      const onClick = () => setSort(colIndex);
      return (
        <th key={colIndex} data-testid="column-header">
          <TableHeaderCellContent
            isSorted={colIndex === sortColumn}
            onClick={onClick}
            isRightAligned={isColumnRightAligned(col)}
          >
            <Ellipsified>{getColumnTitle(colIndex)}</Ellipsified>
            <SortIcon name={iconName} />
          </TableHeaderCellContent>
        </th>
      );
    },
    [sortColumn, sortDirection, getColumnTitle, setSort],
  );

  const renderRow = useCallback(
    (virtualRow, index) => {
      const rowIndex = rowIndexes[virtualRow.index];
      const translateY = virtualRow.start - index * virtualRow.size;
      return (
        <tr
          key={rowIndex}
          data-testid="table-row"
          style={{
            height: `${virtualRow.size}px`,
            transform: `translateY(${translateY}px)`,
          }}
        >
          {data.rows[rowIndex].map((value, columnIndex) => (
            <TableCell
              key={`${rowIndex}-${columnIndex}`}
              value={value}
              data={data}
              series={series}
              settings={settings}
              rowIndex={rowIndex}
              columnIndex={columnIndex}
              isPivoted={isPivoted}
              getCellBackgroundColor={getCellBackgroundColor}
              getExtraDataForClick={getExtraDataForClick}
              checkIsVisualizationClickable={checkIsVisualizationClickable}
              onVisualizationClick={onVisualizationClick}
            />
          ))}
        </tr>
      );
    },
    [
      rowIndexes,
      data,
      series,
      settings,
      isPivoted,
      getCellBackgroundColor,
      getExtraDataForClick,
      checkIsVisualizationClickable,
      onVisualizationClick,
    ],
  );

  return (
    <Root className={className} height={height} ref={parentRef}>
      <ContentContainer>
        <TableContainer
          className="scroll-show scroll-show--hover"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          <Table className="fullscreen-normal-text fullscreen-night-text">
            <thead>
              <tr>{data.cols.map(renderColumnHeader)}</tr>
            </thead>
            <tbody>{virtualizer.getVirtualItems().map(renderRow)}</tbody>
          </Table>
        </TableContainer>
      </ContentContainer>
    </Root>
  );
}

export const TableScrollable = ExplicitSize<TableSimpleProps>({
  refreshMode: props =>
    props.isDashboard && !props.isEditing ? "debounceLeading" : "throttle",
})(TableScrollableInner);
