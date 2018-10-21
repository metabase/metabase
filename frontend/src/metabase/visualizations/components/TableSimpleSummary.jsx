/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import styles from "./Table.css";
import "./TableSimpleSummary.css";
import { t } from "c-3po";
import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import Icon from "metabase/components/Icon.jsx";

import { formatColumn, formatValue } from "metabase/lib/formatting";
import { isColumnRightAligned } from "metabase/visualizations/lib/table";

import cx from "classnames";

import type { VisualizationProps } from "metabase/meta/types/Visualization";
import orderBy from "lodash.orderby";
import set from "lodash.set";
import type { ColumnName } from "metabase/meta/types/Dataset";
import type { SummaryTableSettings } from "metabase/meta/types/summary_table";
import type { VisualizationSettings } from "metabase/meta/types/Card";
import {
  buildIndexGenerator,
  createKey,
} from "metabase/visualizations/lib/table_virtualized";
import { getTableCellClickedObjectForSummary } from "metabase/visualizations/lib/summary_table";

type Props = VisualizationProps & {
  height: number,
  className?: string,

  sort: { [key: ColumnName]: string },
  updateSort: ColumnName => void,
  settings: VisualizationSettings,
  summarySettings: SummaryTableSettings,
};

type State = {
  page: number,
  pageSize: number,
};

@ExplicitSize()
export default class TableSimpleSummary extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);

    this.state = {
      page: 0,
      pageSize: 1,
    };
  }

  static propTypes = {
    data: PropTypes.object.isRequired,
  };

  static defaultProps = {
    className: "",
  };

  componentDidUpdate() {
    let headerHeight = ReactDOM.findDOMNode(
      this.refs.header,
    ).getBoundingClientRect().height;
    let footerHeight = this.refs.footer
      ? (
          ReactDOM.findDOMNode(this.refs.footer || this.refs.header) ||
          headerHeight
        ).getBoundingClientRect().height
      : 0;
    let rowHeight = headerHeight / this.props.data.columnsHeaders.length;
    let pageSize = Math.max(
      1,
      Math.floor((this.props.height - headerHeight - footerHeight) / rowHeight),
    );

    if (this.state.pageSize !== pageSize) {
      this.setState({ pageSize });
    }
  }

  canSort = (columnName: ColumnName) => {
    const settings: SummaryTableSettings = this.props.summarySettings;
    return (
      settings.groupsSources.includes(columnName) ||
      settings.columnsSource.includes(columnName)
    );
  };

  render() {
    const {
      data,
      onVisualizationClick,
      visualizationIsClickable,
      sort,
      updateSort,
    } = this.props;
    const {
      rows,
      columnsHeaders,
      cols,
      columnIndexToFirstInGroupIndexes,
      rowIndexesToColSpans,
      isGrouped,
    } = data;
    const { page, pageSize } = this.state;

    let start = pageSize * page;
    let end = Math.min(rows.length - 1, pageSize * (page + 1) - 1);

    const indexGenerator = buildIndexGenerator({
      groupsForColumns: columnIndexToFirstInGroupIndexes,
      groupsForRows: rowIndexesToColSpans,
    });
    const indexes = indexGenerator({
      windowColumnStartIndex: 0,
      windowColumnStopIndex: cols.length - 1,
      windowRowStartIndex: start,
      windowRowStopIndex: end,
    });
    const trimmedIndexes = indexes.map(
      ({ columnStartIndex, columnStopIndex, rowStartIndex, rowStopIndex }) => ({
        columnStartIndex,
        columnStopIndex,
        rowStartIndex: Math.max(rowStartIndex, start),
        rowStopIndex: Math.min(rowStopIndex, end),
      }),
    );

    const sortedIndexes = orderBy(trimmedIndexes, [
      "rowStartIndex",
      "columnStartIndex",
    ]);

    const groupedIndexes = sortedIndexes.reduce(
      (acc, indexes) =>
        set(acc, indexes.rowStartIndex, [
          ...(acc[indexes.rowStartIndex] || []),
          indexes,
        ]),
      [],
    );

    const groupingColumnsLen = columnsHeaders[0].findIndex(p => p);

    return (
      <div className={cx(this.props.className, "relative flex flex-column")}>
        <div className="flex-full relative">
          <div
            className="absolute top bottom left right scroll-x scroll-show scroll-show--hover"
            style={{ overflowY: "hidden" }}
          >
            <table
              className={cx(
                styles.Table,
                "fullscreen-normal-text",
                "fullscreen-night-text",
              )}
            >
              <thead ref="header">
                {columnsHeaders.map((visibleCols, rowIndex) => (
                  <tr key={`header-${rowIndex}`}>
                    {visibleCols.map((col, colIndex) => {
                      if (col) {
                        const column = col.column;
                        const sortOrder = sort[column.name];
                        const columnName = column.name;
                        const clickAction =
                          this.canSort(columnName) &&
                          (() => updateSort(columnName));
                        const isRightAligned =
                          col.columnSpan > 1 ||
                          isColumnRightAligned(cols[colIndex]);
                        return (
                          <th
                            key={`header-${rowIndex}-${colIndex}`}
                            className={cx(
                              "TableInteractiveSummary-headerCellData cellData text-brand-hover",
                              {
                                "TableInteractiveSummary-headerCellData--sorted": !!sortOrder,
                                "text-right": isRightAligned,
                                "TableSimpleSummary-cellWrapper-firstColumn":
                                  colIndex === 0,
                              },
                            )}
                            onClick={clickAction}
                            colSpan={col.columnSpan}
                          >
                            <div className="relative">
                              <Icon
                                name={
                                  sortOrder === "desc"
                                    ? "chevrondown"
                                    : "chevronup"
                                }
                                width={8}
                                height={8}
                                style={{
                                  position: "absolute",
                                  right: "100%",
                                  marginRight: 3,
                                }}
                              />
                              <Ellipsified>
                                {col.displayText ||
                                  ((col.value || col.value === 0) &&
                                    formatValue(col.value, {
                                      column: col.column,
                                      jsx: true,
                                      rich: true,
                                    })) ||
                                  formatColumn(col.column)}
                              </Ellipsified>
                            </div>
                          </th>
                        );
                      } else if (colIndex < groupingColumnsLen) {
                        return <th key={`header-${colIndex}`} />;
                      }
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {groupedIndexes.map((cellInfos, i) => (
                  <tr key={`row-${i}`}>
                    {cellInfos.map(cellInfo => {
                      const {
                        columnStartIndex,
                        columnStopIndex,
                        rowStartIndex,
                        rowStopIndex,
                      } = cellInfo;
                      const column = cols[columnStartIndex];
                      const row = rows[rowStartIndex];
                      if (!row) {
                        //todo:  why row is null?
                        return null;
                      }
                      let cell = row[columnStartIndex];
                      const isClickable = onVisualizationClick;

                      const rowSpan = rowStopIndex - rowStartIndex + 1;
                      const colSpan = columnStopIndex - columnStartIndex + 1;

                      const isGrandTotal = row.isTotalColumnIndex === 0;
                      const isTotalCell =
                        row.isTotalColumnIndex === columnStartIndex + 1;
                      const isTotalRow =
                        Number.isInteger(row.isTotalColumnIndex) &&
                        row.isTotalColumnIndex <= columnStartIndex + 1;
                      const isGrandTotalCell =
                        isGrandTotal && columnStartIndex === 0;

                      let formatedRes = formatValue(cell, {
                        column: column,
                        jsx: true,
                        rich: true,
                      });

                      if (isGrandTotalCell) {
                        formatedRes = "Grand totals";
                      }
                      if (isTotalCell && typeof formatedRes === "string") {
                        formatedRes = "Totals for " + formatedRes;
                      }

                      return (
                        <td
                          ref={
                            row.columnStopIndex === cols.length - 1 &&
                            row.rowStopIndex === rows.length - 1
                              ? "lastCell"
                              : null
                          }
                          className={cx(
                            "TableSimpleSummary-cellWrapper px1 border-bottom",
                            {
                              "text-right":
                                !isTotalCell &&
                                !isGrandTotalCell &&
                                isColumnRightAligned(cols[columnStartIndex]),
                              "TableSimpleSummary-cellWrapper-firstColumn":
                                columnStartIndex === 0,
                              "TableInteractiveSummary-cellWrapper-grandTotal": isGrandTotal,
                              "TableInteractiveSummary-cellWrapper-total":
                                isTotalRow && !isGrandTotal,
                              "TableInteractiveSummary-cellWrapper-normal":
                                !isTotalRow && !isGrandTotal,
                              "TableInteractiveSummary-cellWrapper-normalGrouped":
                                !isTotalRow &&
                                !isGrandTotal &&
                                isGrouped(columnStartIndex),
                            },
                          )}
                          rowSpan={rowSpan}
                          colSpan={colSpan}
                          key={createKey(cellInfo)}
                        >
                          <span
                            className={cx({
                              "cursor-pointer text-brand-hover": isClickable,
                            })}
                            onClick={
                              isClickable &&
                              (e => {
                                const clicked = getTableCellClickedObjectForSummary(
                                  cols,
                                  row,
                                  columnStartIndex,
                                  this.props.summarySettings.valuesSources,
                                );
                                if (visualizationIsClickable(clicked)) {
                                  onVisualizationClick({
                                    ...clicked,
                                    element: e.currentTarget,
                                  });
                                }
                              })
                            }
                          >
                            {formatedRes}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {pageSize < rows.length ? (
          <div
            ref="footer"
            className="p1 flex flex-no-shrink flex-align-right fullscreen-normal-text fullscreen-night-text"
          >
            <span className="text-bold">{t`Rows ${start + 1}-${end + 1} of ${
              rows.length
            }`}</span>
            <span
              className={cx("text-brand-hover px1 cursor-pointer", {
                disabled: start === 0,
              })}
              onClick={() => this.setState({ page: page - 1 })}
            >
              <Icon name="left" size={10} />
            </span>
            <span
              className={cx("text-brand-hover pr1 cursor-pointer", {
                disabled: end + 1 >= rows.length,
              })}
              onClick={() => this.setState({ page: page + 1 })}
            >
              <Icon name="right" size={10} />
            </span>
          </div>
        ) : null}
      </div>
    );
  }
}
