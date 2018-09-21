/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import styles from "./Table.css";
import { t } from "c-3po";
import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import Icon from "metabase/components/Icon.jsx";

import { formatColumn, formatValue } from "metabase/lib/formatting";
import {
  getTableCellClickedObject,
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";

import cx from "classnames";
import _ from "underscore";

import type { VisualizationProps } from "metabase/meta/types/Visualization";
import { GroupingManager } from "metabase/visualizations/lib/GroupingManager";
import {buildIndexGenerator, createKey} from "metabase/visualizations/lib/table_interactive_summary";
import orderBy from 'lodash.orderby';
import set from 'lodash.set';
import type {ColumnName} from "metabase/meta/types/Dataset";
import type {SummaryTableSettings} from "metabase/meta/types/summary_table";


type Props = VisualizationProps & {
  height: number,
  className?: string,
  groupingManager: GroupingManager,

  sort: {[key: ColumnName] : string},
  updateSort : ColumnName => void,
  settings : SummaryTableSettings
};

type State = {
  page: number,
  pageSize: number,
};

@ExplicitSize
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
    let rowHeight = headerHeight/this.props.data.columnsHeaders.length;
    let pageSize = Math.max(
      1,
      Math.floor((this.props.height - headerHeight - footerHeight) / rowHeight),
    );

    if (this.state.pageSize !== pageSize) {
      this.setState({ pageSize });
    }
  }

  canSort = (columnName : ColumnName) => {
    const settings : SummaryTableSettings = this.props.settings;
    return settings.groupsSources.includes(columnName) || settings.columnsSource.includes(columnName);
  };

  render() {
    const {
      data,
      onVisualizationClick,
      visualizationIsClickable,
      isPivoted,
      sort,
      updateSort
    } = this.props;
    const { rows, columnsHeaders, cols, columnIndexToFirstInGroupIndexes, totalsRows } = data;

    const groupingManager = data;

    const { page, pageSize} = this.state;

    let start = pageSize * page;
    let end = Math.min(rows.length - 1, pageSize * (page + 1) - 1);

    const indexGenerator = buildIndexGenerator({groupsForColumns: columnIndexToFirstInGroupIndexes, groupsForRows: totalsRows});
    const indexes = indexGenerator({windowColumnStartIndex:0, windowColumnStopIndex: cols.length-1, windowRowStartIndex: start, windowRowStopIndex: end});
    const trimmedIndexes = indexes.map(({columnStartIndex, columnStopIndex, rowStartIndex, rowStopIndex }) =>
      ({columnStartIndex, columnStopIndex, rowStartIndex : Math.max(rowStartIndex, start), rowStopIndex : Math.min(rowStopIndex, end)})
    );

    const sortedIndexes = orderBy(trimmedIndexes, ['rowStartIndex', 'columnStartIndex']);

    const groupedIndexes = sortedIndexes.reduce((acc, indexes) => set(acc, indexes.rowStartIndex, [...acc[indexes.rowStartIndex] || [], indexes] ) , [])

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
              {columnsHeaders.map((cols, rowIndex) =>
                <tr key={`header-${rowIndex}`}>
                  {cols.map((col, colIndex) => {
                    if (col) {
                      const column = col.column;
                      const sortOrder = sort[column.name];
                      const columnName = column.name;
                      const clickAction = this.canSort(columnName) && (() => updateSort(columnName));
                      const isRightAligned = false; //isColumnRightAligned(column);
                      return (
                        <th
                          key={`header-${rowIndex}-${colIndex}`}
                          className={cx(

                            "TableInteractive-headerCellData cellData text-brand-hover",
                            {
                              "TableInteractive-headerCellData--sorted": !!sortOrder,
                              "text-right": isRightAligned,
                            },
                          )}
                          onClick={clickAction}
                          style = {{ 'padding-left': colIndex === 0 && '2em'}}
                          colSpan={col.columnSpan}
                        >
                          <div className="relative">
                            <Icon
                              name={
                                sortOrder === 'desc' ? "chevrondown" : "chevronup"
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
                              {col.displayText|| (col.value || col.value === 0) && formatValue(col.value, {
                                column: col.column,
                                jsx: true,
                                rich: true,
                              }) || formatColumn(col.column)}
                            </Ellipsified>
                          </div>
                        </th>
                      );
                    }
                    else if(colIndex < groupingColumnsLen)
                      return <th key={`header-${colIndex}`}/>
                  })}
                </tr>)
              }
              </thead>
              <tbody>
                {groupedIndexes.map((row, i) =>
                  (<tr key={`row-${i}`}>
                    {row.map(arg => {

                      const {columnStartIndex, columnStopIndex, rowStartIndex, rowStopIndex} =arg;
                        const column = cols[columnStartIndex];
                        const row = rows[rowStartIndex];
                        let cell = column.getValue(row);
                        const clicked = getTableCellClickedObject(
                          data,
                          rowStartIndex,
                          columnStartIndex,
                          isPivoted,
                        );
                        const isClickable =
                          onVisualizationClick &&
                          visualizationIsClickable(clicked);
                        const rowSpan = rowStopIndex - rowStartIndex +1;
                        const colSpan = columnStopIndex - columnStartIndex +1;

                        const isGrandTotal = row.isTotalColumnIndex === 0;
                        if (isGrandTotal && columnStartIndex === 0)
                          cell = "Grand totals";

                        let mappedStyle = {
                          ...groupingManager.mapStyle(
                            rowStartIndex,
                            columnStartIndex,
                            { start, stop: end },
                            {},
                          ),
                        };
                        if (isGrandTotal)
                          mappedStyle = {
                            ...mappedStyle,
                            background: "#509ee3",
                            color: "white",
                            fontWeight: "bold",
                          };
                        else if (
                          row.isTotalColumnIndex &&
                          row.isTotalColumnIndex <= columnStartIndex + 1
                        )
                          mappedStyle = {
                            ...mappedStyle,
                            background: "#EDEFF0",
                            color: "#6E757C",
                            fontWeight: "bold",
                          };

                        let formatedRes = formatValue(cell, {
                          column: column,
                          jsx: true,
                          rich: true,
                        });

                        if (
                          row.isTotalColumnIndex === columnStartIndex + 1 &&
                          typeof formatedRes === "string"
                        )
                          formatedRes = "Totals for " + formatedRes;

                        const res = (
                          <td
                            ref={row.columnStopIndex === cols.length -1 && row.rowStopIndex === rows.length -1 ? "lastCell" : null}
                            style={{
                              ...mappedStyle,
                              whiteSpace: "nowrap",
                              verticalAlign: "top",
                              'padding-left': columnStartIndex === 0 && '2em'
                            }}
                            className={cx("px1 border-bottom", {
                              "text-right": isColumnRightAligned(
                                cols[columnStartIndex],
                              ),

                            })}
                            rowSpan={rowSpan}
                            colSpan={colSpan}
                            key={createKey(arg)}
                          >
                            <span
                              className={cx({
                                "cursor-pointer text-brand-hover": isClickable,
                              })}
                              onClick={
                                isClickable
                                  ? e => {
                                    onVisualizationClick({
                                      ...clicked,
                                      element: e.currentTarget,
                                    });
                                  }
                                  : undefined
                              }
                            >
                              {formatedRes}
                            </span>
                          </td>
                        );
                        return res;
                      })}
                  </tr>)
                )}
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
