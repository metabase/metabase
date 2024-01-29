import { useCallback, useMemo, isValidElement } from "react";
import cx from "classnames";

import ExternalLink from "metabase/core/components/ExternalLink";

import type { OptionsType } from "metabase/lib/formatting/types";
import { formatValue } from "metabase/lib/formatting";
import {
  getTableCellClickedObject,
  getTableClickedObjectRowData,
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";

import type {
  DatasetColumn,
  DatasetData,
  RowValue,
  RowValues,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import type { ClickObject } from "metabase-lib";
import { isID, isFK } from "metabase-lib/types/utils/isa";

import MiniBar from "../MiniBar";
import { CellRoot, CellContent } from "./TableCell.styled";

type GetCellDataOpts = {
  value: RowValue;
  clicked: ClickObject;
  extraData: Record<string, unknown>;
  cols: DatasetColumn[];
  rows: RowValues[];
  columnIndex: number;
  columnSettings: OptionsType;
};

function getCellData({
  value,
  clicked,
  extraData,
  cols,
  rows,
  columnIndex,
  columnSettings,
}: GetCellDataOpts) {
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

interface TableCellProps {
  value: RowValue;
  data: DatasetData;
  series: Series;
  settings: VisualizationSettings;
  rowIndex: number;
  columnIndex: number;
  isPivoted: boolean;
  getCellBackgroundColor: (
    value: RowValue,
    rowIndex: number,
    columnName: string,
  ) => string | undefined;
  getExtraDataForClick: (clickObject: ClickObject) => Record<string, unknown>;
  checkIsVisualizationClickable: (clickObject: ClickObject) => boolean;
  onVisualizationClick?: (clickObject: ClickObject) => void;
}

export function TableCell({
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
}: TableCellProps) {
  const { rows, cols } = data;
  const column = cols[columnIndex];
  const columnSettings = settings.column(column);

  const clickedRowData = useMemo(
    () =>
      getTableClickedObjectRowData(
        // @ts-expect-error -- visualizations/lib/table should be typed
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

  const isLink = isValidElement(cellData) && cellData.type === ExternalLink;
  const isClickable = !isLink;

  const onClick = useCallback(
    e => {
      if (checkIsVisualizationClickable(clicked)) {
        onVisualizationClick?.({
          ...clicked,
          element: e.currentTarget,
          extraData,
        });
      }
    },
    [clicked, extraData, checkIsVisualizationClickable, onVisualizationClick],
  );

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
