/* eslint-disable react/prop-types */
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { getIn } from "icepick";
import _ from "underscore";
import { t } from "ttag";

import ExplicitSize from "metabase/components/ExplicitSize";
import Ellipsified from "metabase/core/components/Ellipsified";
import Icon from "metabase/components/Icon";

import { isPositiveInteger } from "metabase/lib/number";
import { isID } from "metabase/lib/schema_metadata";
import { HARD_ROW_LIMIT } from "metabase/lib/query";
import { isColumnRightAligned } from "metabase/visualizations/lib/table";

import TableCell from "./TableCell";
import {
  Root,
  ContentContainer,
  Table,
  TableContainer,
  TableHeaderCellContent,
  TableFooter,
  SortIcon,
  PaginationMessage,
  PaginationButton,
} from "./TableSimple.styled";

function getBoundingClientRectSafe(ref) {
  return ref.current?.getBoundingClientRect?.() ?? {};
}

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
  card,
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
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(1);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const firstRowRef = useRef(null);

  useLayoutEffect(() => {
    const { height: headerHeight } = getBoundingClientRectSafe(headerRef);
    const { height: footerHeight = 0 } = getBoundingClientRectSafe(footerRef);
    const { height: rowHeight = 0 } = getBoundingClientRectSafe(firstRowRef);
    const currentPageSize = Math.floor(
      (height - headerHeight - footerHeight) / (rowHeight + 1),
    );
    const normalizedPageSize = Math.max(1, currentPageSize);
    if (pageSize !== normalizedPageSize) {
      setPageSize(normalizedPageSize);
    }
  }, [height, pageSize]);

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
  const limit = getIn(card, ["dataset_query", "query", "limit"]) || undefined;
  const getCellBackgroundColor = settings["table._cell_background_getter"];

  const start = pageSize * page;
  const end = Math.min(rows.length - 1, pageSize * (page + 1) - 1);

  const handlePreviousPage = useCallback(() => {
    setPage(p => p - 1);
  }, []);

  const handleNextPage = useCallback(() => {
    setPage(p => p + 1);
  }, []);

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

  const paginatedRowIndexes = useMemo(() => rowIndexes.slice(start, end + 1), [
    rowIndexes,
    start,
    end,
  ]);

  const paginateMessage = useMemo(() => {
    if (limit === undefined && rows.length >= HARD_ROW_LIMIT) {
      return t`Rows ${start + 1}-${end + 1} of first ${rows.length}`;
    }
    return t`Rows ${start + 1}-${end + 1} of ${rows.length}`;
  }, [rows, start, end, limit]);

  const renderColumnHeader = useCallback(
    (col, colIndex) => {
      const iconName = sortDirection === "desc" ? "chevrondown" : "chevronup";
      const onClick = () => setSort(colIndex);
      return (
        <th key={colIndex}>
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
    (rowIndex, index) => {
      const ref = index === 0 ? firstRowRef : null;
      return (
        <tr key={rowIndex} ref={ref} data-testid="table-row">
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
      checkIsVisualizationClickable,
      getCellBackgroundColor,
      getExtraDataForClick,
      onVisualizationClick,
    ],
  );

  return (
    <Root className={className}>
      <ContentContainer>
        <TableContainer className="scroll-show scroll-show--hover">
          <Table className="fullscreen-normal-text fullscreen-night-text">
            <thead ref={headerRef}>
              <tr>{cols.map(renderColumnHeader)}</tr>
            </thead>
            <tbody>{paginatedRowIndexes.map(renderRow)}</tbody>
          </Table>
        </TableContainer>
      </ContentContainer>
      {pageSize < rows.length && (
        <TableFooter
          className="fullscreen-normal-text fullscreen-night-text"
          ref={footerRef}
        >
          <PaginationMessage>{paginateMessage}</PaginationMessage>
          <PaginationButton
            direction="previous"
            onClick={handlePreviousPage}
            disabled={start === 0}
          >
            <Icon name="triangle_left" size={10} />
          </PaginationButton>
          <PaginationButton
            direction="next"
            onClick={handleNextPage}
            disabled={end + 1 >= rows.length}
          >
            <Icon name="triangle_right" size={10} />
          </PaginationButton>
        </TableFooter>
      )}
    </Root>
  );
}

export default ExplicitSize({
  refreshMode: props =>
    props.isDashboard && !props.isEditing ? "debounce" : "throttle",
})(TableSimple);
