/* eslint-disable react/prop-types */
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import cx from "classnames";
import { getIn } from "icepick";
import _ from "underscore";
import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import ExplicitSize from "metabase/components/ExplicitSize";
import Ellipsified from "metabase/core/components/Ellipsified";
import Icon from "metabase/components/Icon";

import { formatValue } from "metabase/lib/formatting";
import { isPositiveInteger } from "metabase/lib/number";
import { isID, isFK } from "metabase/lib/schema_metadata";
import { HARD_ROW_LIMIT } from "metabase/lib/query";
import {
  getTableCellClickedObject,
  getTableClickedObjectRowData,
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";

import MiniBar from "./MiniBar";
import styles from "./Table.css";

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

const CELL_HEADER_ICON_STYLE = {
  position: "absolute",
  right: "100%",
  marginRight: 3,
};

function getCellData({
  value,
  clicked,
  extraData,
  cols,
  rows,
  columnIndex,
  columnSettings,
}) {
  if (value == null) {
    return "-";
  }
  if (columnSettings["show_mini_bar"]) {
    return (
      <MiniBar
        value={value}
        options={columnSettings}
        extent={getColumnExtent(cols, rows, columnIndex)}
      />
    );
  }
  return formatValue(value, {
    ...columnSettings,
    clicked: { ...clicked, extraData },
    type: "cell",
    jsx: true,
    rich: true,
  });
}

function TableCell({
  value,
  data,
  series,
  settings,
  rowIndex,
  columnIndex,
  isPivoted,
  getCellBackgroundColor,
  getExtraDataForClick,
  checkIsVisualizationClickable,
  onVisualizationClick,
}) {
  const { rows, cols } = data;
  const column = cols[columnIndex];
  const columnSettings = settings.column(column);

  const clickedRowData = useMemo(
    () =>
      getTableClickedObjectRowData(
        series,
        rowIndex,
        columnIndex,
        isPivoted,
        data,
      ),
    [data, series, rowIndex, columnIndex, isPivoted],
  );

  const clicked = useMemo(
    () =>
      getTableCellClickedObject(
        data,
        settings,
        rowIndex,
        columnIndex,
        isPivoted,
        clickedRowData,
      ),
    [data, settings, rowIndex, columnIndex, isPivoted, clickedRowData],
  );

  const extraData = useMemo(() => getExtraDataForClick?.(clicked) ?? {}, [
    clicked,
    getExtraDataForClick,
  ]);

  const cellData = useMemo(
    () =>
      getCellData({
        value,
        clicked,
        extraData,
        cols,
        rows,
        columnIndex,
        columnSettings,
      }),
    [value, clicked, extraData, cols, rows, columnIndex, columnSettings],
  );

  const isLink = cellData && cellData.type === ExternalLink;
  const isClickable = !isLink && checkIsVisualizationClickable(clicked);

  const onClick = useMemo(() => {
    if (!isClickable) {
      return;
    }
    return e => {
      onVisualizationClick({
        ...clicked,
        element: e.currentTarget,
        extraData,
      });
    };
  }, [isClickable, clicked, extraData, onVisualizationClick]);

  const style = useMemo(() => {
    const result = { whiteSpace: "nowrap" };
    if (getCellBackgroundColor) {
      result.backgroundColor = getCellBackgroundColor(
        value,
        rowIndex,
        column.name,
      );
    }
    return result;
  }, [value, rowIndex, column, getCellBackgroundColor]);

  const classNames = useMemo(
    () =>
      cx(
        "px1 border-bottom text-dark fullscreen-normal-text fullscreen-night-text text-bold",
        {
          "text-right": isColumnRightAligned(column),
          "Table-ID": value != null && isID(column),
          "Table-FK": value != null && isFK(column),
          link: isClickable && isID(column),
        },
      ),
    [value, column, isClickable],
  );

  const classNames2 = useMemo(
    () =>
      cx("cellData inline-block", {
        "cursor-pointer text-brand-hover": isClickable,
      }),
    [isClickable],
  );

  return (
    <td className={classNames} style={style}>
      <span className={classNames2} onClick={onClick}>
        {cellData}
      </span>
    </td>
  );
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
      indexes = _.sortBy(rowIndexes, rowIndex => {
        const value = rows[rowIndex][sortColumn];
        const column = cols[sortColumn];
        return formatCellValueForSorting(value, column);
      });
    }

    if (sortDirection === "desc") {
      indexes = indexes.reverse();
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
      const onClick = () => setSort(colIndex);
      const isSortedColumn = sortColumn === colIndex;
      return (
        <th
          key={colIndex}
          className={cx(
            "TableInteractive-headerCellData cellData text-brand-hover text-medium",
            {
              "TableInteractive-headerCellData--sorted": isSortedColumn,
              "text-right": isColumnRightAligned(col),
            },
          )}
          onClick={onClick}
        >
          <div className="relative">
            <Icon
              name={sortDirection === "desc" ? "chevrondown" : "chevronup"}
              width={8}
              height={8}
              style={CELL_HEADER_ICON_STYLE}
            />
            <Ellipsified>{getColumnTitle(colIndex)}</Ellipsified>
          </div>
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
    <div className={cx(className, "relative flex flex-column")}>
      <div className="flex-full relative">
        <div className="absolute top bottom left right scroll-x scroll-show scroll-show--hover overflow-y-hidden">
          <table
            className={cx(
              styles.Table,
              styles.TableSimple,
              "fullscreen-normal-text",
              "fullscreen-night-text",
            )}
          >
            <thead ref={headerRef}>
              <tr>{cols.map(renderColumnHeader)}</tr>
            </thead>
            <tbody>{paginatedRowIndexes.map(renderRow)}</tbody>
          </table>
        </div>
      </div>
      {pageSize < rows.length && (
        <div
          ref={footerRef}
          className="p1 flex flex-no-shrink flex-align-right fullscreen-normal-text fullscreen-night-text"
        >
          <span className="text-bold">{paginateMessage}</span>
          <span
            className={cx("text-brand-hover px1 cursor-pointer", {
              disabled: start === 0,
            })}
            onClick={handlePreviousPage}
          >
            <Icon name="triangle_left" size={10} />
          </span>
          <span
            className={cx("text-brand-hover pr1 cursor-pointer", {
              disabled: end + 1 >= rows.length,
            })}
            onClick={handleNextPage}
          >
            <Icon name="triangle_right" size={10} />
          </span>
        </div>
      )}
    </div>
  );
}

export default ExplicitSize({
  refreshMode: props =>
    props.isDashboard && !props.isEditing ? "debounce" : "throttle",
})(TableSimple);
