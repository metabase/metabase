/* eslint-disable react/prop-types */
import { useCallback, useMemo, useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";
import { Ellipsified } from "metabase/core/components/Ellipsified";

import { isPositiveInteger } from "metabase/lib/number";
import { isColumnRightAligned } from "metabase/visualizations/lib/table";
import { isID } from "metabase-lib/types/utils/isa";

import TableCell from "./TableCell";
import {
  Root,
  ContentContainer,
  Table,
  TableContainer,
  TableHeaderCellContent,
  SortIcon,
} from "./TableSimple.styled";

function formatCellValueForSorting(value, column) {
  if (typeof value === "string") {
    if (isID(column) && isPositiveInteger(value)) {
      return parseInt(value, 10);
    }
    // for strings we should be case insensitive
    return value.toLowerCase();
  }
  if (value === null) {
    return undefined;
  }
  return value;
}

function TableSimple({
  data,
  series,
  settings,
  isPivoted,
  height,
  className,
  onVisualizationClick,
  visualizationIsClickable,
  getColumnTitle,
  getExtraDataForClick,
}) {
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: data.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  const setSort = useCallback(
    colIndex => {
      if (sortColumn === colIndex) {
        setSortDirection(direction => (direction === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(colIndex);
      }
    },
    [sortColumn],
  );

  const checkIsVisualizationClickable = useCallback(
    clickedItem => {
      return (
        onVisualizationClick &&
        visualizationIsClickable &&
        visualizationIsClickable(clickedItem)
      );
    },
    [onVisualizationClick, visualizationIsClickable],
  );

  const { rows, cols } = data;
  const getCellBackgroundColor = settings["table._cell_background_getter"];

  const rowIndexes = useMemo(() => {
    let indexes = _.range(0, rows.length);

    if (sortColumn != null) {
      indexes = _.sortBy(indexes, rowIndex => {
        const value = rows[rowIndex][sortColumn];
        const column = cols[sortColumn];
        return formatCellValueForSorting(value, column);
      });
    }

    if (sortDirection === "desc") {
      indexes.reverse();
    }

    return indexes;
  }, [cols, rows, sortColumn, sortDirection]);

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
            <SortIcon name={iconName} />
            <Ellipsified>{getColumnTitle(colIndex)}</Ellipsified>
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
      data,
      series,
      settings,
      isPivoted,
      rowIndexes,
      checkIsVisualizationClickable,
      getCellBackgroundColor,
      getExtraDataForClick,
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
              <tr>{cols.map(renderColumnHeader)}</tr>
            </thead>
            <tbody>{virtualizer.getVirtualItems().map(renderRow)}</tbody>
          </Table>
        </TableContainer>
      </ContentContainer>
    </Root>
  );
}

export default ExplicitSize({
  refreshMode: props =>
    props.isDashboard && !props.isEditing ? "debounce" : "throttle",
})(TableSimple);
