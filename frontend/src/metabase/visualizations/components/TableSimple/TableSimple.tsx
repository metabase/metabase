import cx from "classnames";
import { getIn } from "icepick";
import { useCallback, useLayoutEffect, useMemo, useState, useRef } from "react";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { isPositiveInteger } from "metabase/lib/number";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { isColumnRightAligned } from "metabase/visualizations/lib/table";
import type { ClickObject } from "metabase-lib";
import { isID } from "metabase-lib/v1/types/utils/isa";
import type {
  Card,
  DatasetColumn,
  DatasetData,
  RowValue,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { TableCell } from "./TableCell";
import TableFooter from "./TableFooter";
import {
  Root,
  ContentContainer,
  Table,
  TableContainer,
  TableHeaderCellContent,
  SortIcon,
} from "./TableSimple.styled";

function getBoundingClientRectSafe(ref: {
  current?: HTMLElement | null;
}): Partial<DOMRect> {
  return ref.current?.getBoundingClientRect?.() ?? {};
}

function formatCellValueForSorting(value: RowValue, column: DatasetColumn) {
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

interface TableSimpleProps {
  card: Card;
  data: DatasetData;
  series: Series;
  settings: VisualizationSettings;
  height: number;
  isDashboard?: boolean;
  isEditing?: boolean;
  isPivoted: boolean;
  className?: string;
  getColumnTitle: (colIndex: number) => string;
  getExtraDataForClick: (clickObject: ClickObject) => Record<string, unknown>;
  onVisualizationClick?: (clickObject: ClickObject) => void;
  visualizationIsClickable?: (clickObject: ClickObject) => boolean;
}

function TableSimpleInner({
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
}: TableSimpleProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(1);
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState("asc");

  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const firstRowRef = useRef(null);

  useLayoutEffect(() => {
    const { height: headerHeight = 0 } = getBoundingClientRectSafe(headerRef);
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
    (colIndex: number) => {
      if (sortColumn === colIndex) {
        setSortDirection(direction => (direction === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(colIndex);
      }
    },
    [sortColumn],
  );

  const checkIsVisualizationClickable = useCallback(
    (clickedItem: ClickObject) => {
      return Boolean(
        onVisualizationClick &&
          visualizationIsClickable &&
          visualizationIsClickable(clickedItem),
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

  const paginatedRowIndexes = useMemo(
    () => rowIndexes.slice(start, end + 1),
    [rowIndexes, start, end],
  );

  const renderColumnHeader = useCallback(
    (col, colIndex: number) => {
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
    (rowIndex: number, index: number) => {
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
        <TableContainer className={cx(CS.scrollShow, CS.scrollShowHover)}>
          <Table
            className={cx(
              DashboardS.fullscreenNormalText,
              DashboardS.fullscreenNightText,
              EmbedFrameS.fullscreenNightText,
            )}
          >
            <thead ref={headerRef}>
              <tr>{cols.map(renderColumnHeader)}</tr>
            </thead>
            <tbody>{paginatedRowIndexes.map(renderRow)}</tbody>
          </Table>
        </TableContainer>
      </ContentContainer>
      {pageSize < rows.length && (
        <TableFooter
          start={start}
          end={end}
          limit={limit}
          total={rows.length}
          onPreviousPage={handlePreviousPage}
          onNextPage={handleNextPage}
          ref={footerRef}
        />
      )}
    </Root>
  );
}

export const TableSimple = ExplicitSize<TableSimpleProps>({
  refreshMode: props =>
    props.isDashboard && !props.isEditing ? "debounceLeading" : "throttle",
})(TableSimpleInner);
