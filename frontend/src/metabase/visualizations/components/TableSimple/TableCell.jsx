/* eslint-disable react/prop-types */
import { useMemo } from "react";
import cx from "classnames";

import ExternalLink from "metabase/core/components/ExternalLink";

import { formatValue } from "metabase/lib/formatting";
import {
  getTableCellClickedObject,
  getTableClickedObjectRowData,
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";
import { isID, isFK } from "metabase-lib/types/utils/isa";

import MiniBar from "../MiniBar";
import { CellRoot, CellContent } from "./TableCell.styled";

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

  const extraData = useMemo(
    () => getExtraDataForClick?.(clicked) ?? {},
    [clicked, getExtraDataForClick],
  );

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
    return e => {
      onVisualizationClick({
        ...clicked,
        element: e.currentTarget,
        extraData,
      });
    };
  }, [clicked, extraData, onVisualizationClick]);

  const backgroundColor = useMemo(
    () => getCellBackgroundColor?.(value, rowIndex, column.name),
    [value, rowIndex, column, getCellBackgroundColor],
  );

  const classNames = useMemo(
    () =>
      cx("fullscreen-normal-text fullscreen-night-text", {
        "Table-ID": value != null && isID(column),
        "Table-FK": value != null && isFK(column),
        link: isClickable && isID(column),
      }),
    [value, column, isClickable],
  );

  return (
    <CellRoot
      className={classNames}
      backgroundColor={backgroundColor}
      isRightAligned={isColumnRightAligned(column)}
    >
      <CellContent
        className="cellData"
        isClickable={isClickable}
        onClick={isClickable ? onClick : undefined}
        data-testid="cell-data"
      >
        {cellData}
      </CellContent>
    </CellRoot>
  );
}

export default TableCell;
