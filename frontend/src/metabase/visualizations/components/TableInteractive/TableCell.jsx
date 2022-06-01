/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import ExternalLink from "metabase/core/components/ExternalLink";

import { isID, isFK } from "metabase/lib/schema_metadata";
import { isColumnRightAligned } from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";
import { withDeepCompareMemo } from "metabase/hoc/DeepCompareMemo";
import MiniBar from "../MiniBar";
import "./TableInteractive.css";

const ROW_HEIGHT = 36;

export const TableCell = withDeepCompareMemo(
  function TableCell({
    key,
    style,
    rowIndex,
    columnIndex,
    data,
    settings,
    dragColIndex,
    showDetailShortcut,
    clicked,
    formattedValue,
    visualizationIsClickable,
    backgroundColor,
    columnLeft,
    renderTableCellWrapper,
    onClick,
    onHover,
    onLeave,
  }) {
    const { rows, cols } = data;
    const column = cols[columnIndex];
    const row = rows[rowIndex];
    const value = row[columnIndex];

    const columnSettings = settings.column(column);

    let cellData = null;
    if (columnSettings["show_mini_bar"]) {
      const [min, max] = getColumnExtent(data.cols, data.rows, columnIndex);
      cellData = (
        <MiniBar
          value={value}
          options={columnSettings}
          min={min}
          max={max}
          cellHeight={ROW_HEIGHT}
        />
      );
    } else {
      /* using formatValue instead of <Value> here for performance. The later wraps in an extra <span> */
      cellData = formattedValue;
    }

    const isLink = cellData && cellData.type === ExternalLink;
    const isClickable = !isLink && visualizationIsClickable;

    return (
      <div
        key={key}
        style={{
          ...style,
          // use computed left if dragging
          left: columnLeft,
          // add a transition while dragging column
          transition: dragColIndex != null ? "left 200ms" : null,
          backgroundColor,
        }}
        className={cx("TableInteractive-cellWrapper text-dark", {
          "TableInteractive-cellWrapper--firstColumn": columnIndex === 0,
          padLeft: columnIndex === 0 && !showDetailShortcut,
          "TableInteractive-cellWrapper--lastColumn":
            columnIndex === cols.length - 1,
          "TableInteractive-emptyCell": value == null,
          "cursor-pointer": isClickable,
          "justify-end": isColumnRightAligned(column),
          "Table-ID": value != null && isID(column),
          "Table-FK": value != null && isFK(column),
          link: isClickable && isID(column),
        })}
        onClick={
          isClickable
            ? e => {
                onClick(clicked, e.currentTarget);
              }
            : undefined
        }
        onKeyUp={
          isClickable
            ? e => {
                e.key === "Enter" && onClick(clicked, e.currentTarget);
              }
            : undefined
        }
        onMouseEnter={
          showDetailShortcut ? e => onHover(e, rowIndex) : undefined
        }
        onMouseLeave={showDetailShortcut ? e => onLeave() : undefined}
        tabIndex="0"
      >
        {renderTableCellWrapper(cellData)}
      </div>
    );
  },
  ["style"],
);
