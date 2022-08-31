import React, { useMemo } from "react";
import cx from "classnames";
import _ from "underscore";

import ExternalLink from "metabase/core/components/ExternalLink";

import { formatValue } from "metabase/lib/formatting";
import { getColumnExtent } from "metabase/visualizations/lib/utils";

import { Column, Row, Value } from "metabase-types/types/Dataset";
import { VisualizationProps } from "metabase-types/types/Visualization";

import MiniBar from "../MiniBar";
import { CellRoot, CellContent } from "./ListCell.styled";

export interface ListCellProps
  extends Pick<VisualizationProps, "data" | "settings"> {
  value: Value;
  columnIndex: number;
}

interface CellDataProps {
  value: Value;
  cols: Column[];
  rows: Row[];
  columnIndex: number;
  columnSettings: Record<string, unknown>;
}

function getCellData({
  value,
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
    type: "cell",
    jsx: true,
    rich: true,
  });
}

function ListCellContent({
  value,
  data,
  settings,
  columnIndex,
}: ListCellProps) {
  const { rows, cols } = data;
  const column = cols[columnIndex];
  const columnSettings = settings.column(column);

  const cellData: any = useMemo(
    () =>
      getCellData({
        value,
        cols,
        rows,
        columnIndex,
        columnSettings,
      }),
    [value, cols, rows, columnIndex, columnSettings],
  );

  const isLink = cellData && cellData.type === ExternalLink;

  const classNames = cx("fullscreen-normal-text fullscreen-night-text", {
    link: isLink,
  });

  return (
    <CellContent
      className={classNames}
      isClickable={isLink}
      data-testid="cell-data"
    >
      {cellData}
    </CellContent>
  );
}

function ListCell(props: ListCellProps) {
  return (
    <CellRoot>
      <ListCellContent {...props} />
    </CellRoot>
  );
}

export default Object.assign(ListCell, {
  Root: CellRoot,
  ContentStyled: CellContent,
  Content: ListCellContent,
});
