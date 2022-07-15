/* eslint-disable react/prop-types */
import React, { useMemo } from "react";
import cx from "classnames";
import _ from "underscore";

import ExternalLink from "metabase/core/components/ExternalLink";

import { formatValue } from "metabase/lib/formatting";
import {
  getTableCellClickedObject,
  getTableClickedObjectRowData,
} from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";

import { Column, Row, Value } from "metabase-types/types/Dataset";
import {
  ClickObject,
  VisualizationProps,
} from "metabase-types/types/Visualization";

import MiniBar from "../MiniBar";
import { CellRoot, CellContent } from "./ListCell.styled";

export interface ListCellProps
  extends Pick<
    VisualizationProps,
    | "data"
    | "series"
    | "settings"
    | "getExtraDataForClick"
    | "onVisualizationClick"
  > {
  value: Value;
  rowIndex: number;
  columnIndex: number;
  slot: "left" | "right";
  checkIsVisualizationClickable: (clickObject: ClickObject) => boolean;
}

interface CellDataProps {
  value: Value;
  clicked: ClickObject;
  extraData: Record<string, unknown>;
  cols: Column[];
  rows: Row[];
  columnIndex: number;
  columnSettings: Record<string, unknown>;
}

function getCellData({
  value,
  clicked,
  extraData,
  cols,
  rows,
  columnIndex,
  columnSettings,
}: CellDataProps) {
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

function ListCell({
  value,
  data,
  series,
  settings,
  rowIndex,
  columnIndex,
  slot,
  getExtraDataForClick,
  checkIsVisualizationClickable,
  onVisualizationClick,
}: ListCellProps) {
  const { rows, cols } = data;
  const column = cols[columnIndex];
  const columnSettings = settings.column(column);

  const clickedRowData = useMemo(
    () =>
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      getTableClickedObjectRowData(series, rowIndex, columnIndex, false, data),
    [data, series, rowIndex, columnIndex],
  );

  const clicked = useMemo(
    () =>
      getTableCellClickedObject(
        data,
        settings,
        rowIndex,
        columnIndex,
        false,
        clickedRowData,
      ),
    [data, settings, rowIndex, columnIndex, clickedRowData],
  );

  const extraData: Record<string, unknown> = useMemo(
    () => (getExtraDataForClick?.(clicked) ?? {}) as Record<string, unknown>,
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
    return (e: React.SyntheticEvent) => {
      onVisualizationClick({
        ...clicked,
        element: e.currentTarget,
        extraData,
      });
    };
  }, [clicked, extraData, onVisualizationClick]);

  const classNames = cx("fullscreen-normal-text fullscreen-night-text", {
    link: isClickable,
  });

  return (
    <CellRoot className={classNames} slot={slot}>
      <CellContent
        isClickable={isClickable}
        onClick={isClickable ? onClick : undefined}
        data-testid="cell-data"
      >
        {cellData}
      </CellContent>
    </CellRoot>
  );
}

export default ListCell;
