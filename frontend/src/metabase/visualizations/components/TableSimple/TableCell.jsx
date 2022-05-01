/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import cx from "classnames";
import _ from "underscore";

import ExternalLink from "metabase/core/components/ExternalLink";

import { formatValue } from "metabase/lib/formatting";
import { isID, isFK } from "metabase/lib/schema_metadata";
import {
  getTableCellClickedObject,
  getTableClickedObjectRowData,
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";

import MiniBar from "../MiniBar";

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

export default TableCell;
