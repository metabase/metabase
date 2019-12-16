import React, { Component } from "react";
import { formatValue } from "metabase/lib/formatting";
import { isID } from "metabase/lib/schema_metadata";

import cx from "classnames";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

type Props = VisualizationProps;

export default class SingleRow extends Component {
  props: Props;

  constructor(props: Props) {
    super(props);
  }

  vizRows(vizColCount) {
    const { data: { cols } } = this.props;
    const result = [];
    let c = 0;
    while (c < cols.length) {
      const vizColumns = [];
      for (let cp = 0; cp < vizColCount; cp++) {
        if (c < cols.length) {
          vizColumns.push(cols[c++]);
        } else {
          // Complete the last row with null columns to render empty cells
          vizColumns.push(null);
        }
      }
      result.push(vizColumns);
    }
    return result;
  }

  rowCells(vizColumns, vizRowIndex, vizColCount) {
    const {
      data: { rows },
      settings,
      onVisualizationClick,
      visualizationIsClickable,
      getColumnTitle,
    } = this.props;

    const cells = [];
    vizColumns.forEach((column, vizColIndex) => {
      const colIndex = vizRowIndex * vizColCount + vizColIndex;
      const value = column && rows[0][colIndex];
      const clicked = { column, value };
      const isClickable =
        column && onVisualizationClick && visualizationIsClickable(clicked);
      const isLink = column && isID(column);

      cells.push(
        <div className="Grid-cell" key={vizColIndex * 2}>{column && getColumnTitle(colIndex)}</div>
      );
      cells.push(
        <div className="Grid-cell text-bold text-dark" key={vizColIndex * 2 + 1}>
          <div><span
            className={cx({
              "cursor-pointer": isClickable,
              link: isClickable && isLink,
            })}
            onClick={
              isClickable &&
              (e => {
                onVisualizationClick({ ...clicked, element: e.currentTarget });
              })
            }
          >
            {column && formatValue(value, {
              ...settings.column(column),
              jsx: true,
              rich: true,
            })}
          </span></div>
        </div>
      );
    });
    return cells;
  }

  render() {
    const { data } = this.props;

    if (!data) {
      return null;
    }

    const vizColCount = 2;
    return (
      <div className="flex-full px1 pb1 flex flex-column">
        <div className="Grid">
          <div className="Grid-cell px4">
            {this.vizRows(vizColCount).map((vizColumns, vizRowIndex) => (
              <div className="Grid mb2" key={vizRowIndex}>
                {this.rowCells(vizColumns, vizRowIndex, vizColCount)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}
