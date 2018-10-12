

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import "./TableInteractiveSummary.css";

import Icon from "metabase/components/Icon.jsx";

import { formatValue, formatColumn } from "metabase/lib/formatting";
import { isID } from "metabase/lib/schema_metadata";
import {
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";

import _ from "underscore";
import cx from "classnames";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";

// $FlowFixMe: had to ignore react-virtualized in flow, probably due to different version
import { Grid, ScrollSync } from "react-virtualized";
import Draggable from "react-draggable";

const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 30;
const MIN_COLUMN_WIDTH = ROW_HEIGHT;
const RESIZE_HANDLE_WIDTH = 5;

import type { VisualizationProps } from "metabase/meta/types/Visualization";
import type {Row, Column, ColumnName} from "metabase/meta/types/Dataset";
import orderBy from "lodash.orderby";
import set from "lodash.set";
import flatMap from "lodash.flatmap";
import {buildCellRangeRenderer, buildIndexGenerator, getTableCellClickedObjectForSummary} from "metabase/visualizations/lib/summary_table";
import type {SummaryTableSettings} from "metabase/meta/types/summary_table";
import type {VisualizationSettings} from "metabase/meta/types/Card";

type Props = VisualizationProps & {
  width: number,
  height: number,

  onActionDismissal: () => void,

  sort: {[key: ColumnName] : string},
  updateSort : ColumnName => void,
  settings : VisualizationSettings,
  summarySettings: SummaryTableSettings
};
type State = {
  columnWidths: number[],
  contentWidths: ?(number[]),
};

type CellRendererProps = {
  key: string,
  style: { [key: string]: any },
  columnIndex: number,
  rowIndex: number,
};


type Range = { start: Number, stop: Number };

type RenderCellType = {
  row: Row,
  column: Column,
  columnIndex: number,
  visibleRowIndices: Range,
  key: string,
  rowIndex: number,
  isGrandTotal: boolean,
  style: { [key: string]: any },
  onVisualizationClick: Function,
  visualizationIsClickable: Function,
};

type GridComponent = Component<void, void, void> & {
  recomputeGridSize: () => void,
};

@ExplicitSize()
export default class TableInteractiveSummary extends Component {
  state: State;
  props: Props;

  columnHasResized: { [key: number]: boolean };
  columnNeedsResize: { [key: number]: boolean };
  _div: HTMLElement;

  header: GridComponent;
  grid: GridComponent;

  constructor(props: Props) {
    super(props);

    this.state = {
      columnWidths: [],
      contentWidths: null
    };
    this.columnHasResized = {};
  }

  static propTypes = {
    data: PropTypes.object.isRequired,
  };

  componentWillMount() {
    // for measuring cells:
    this._div = document.createElement("div");
    this._div.className = "TableInteractiveSummary";
    this._div.style.display = "inline-block";
    this._div.style.position = "absolute";
    this._div.style.visibility = "hidden";
    this._div.style.zIndex = "-1";
    document.body.appendChild(this._div);

    this._measure();
  }

  componentWillUnmount() {
    if (this._div && this._div.parentNode) {
      this._div.parentNode.removeChild(this._div);
    }
  }

  componentWillReceiveProps(newProps: Props) {
    if (
      JSON.stringify(this.props.data && this.props.data.cols) !==
      JSON.stringify(newProps.data && newProps.data.cols)
    ) {
      this.resetColumnWidths();
    }
  }

  shouldComponentUpdate(nextProps: Props, nextState: State) {
    const PROP_KEYS: string[] = ["width", "height", "settings", "data"];
    // compare specific props and state to determine if we should re-render
    return (
      !_.isEqual(
        _.pick(this.props, ...PROP_KEYS),
        _.pick(nextProps, ...PROP_KEYS),
      ) || !_.isEqual(this.state, nextState)
    );
  }

  componentDidUpdate() {
    if (!this.state.contentWidths) {
      this._measure();
    }
  }

  resetColumnWidths() {
    this.setState({
      columnWidths: [],
      contentWidths: null,
    });
    this.columnHasResized = {};
    this.props.onUpdateVisualizationSettings({
      "summaryTable.column_widths": undefined,
    });
  }

  _measure = () => {
    let {
      data: { cols, probeRows, columnsHeaders },
    } = this.props;

    const probeHeaders = flatMap(columnsHeaders, row =>
      row.map((header, columnIndex) => header && { ...header, columnIndex }),
    ).filter(p => p);

    ReactDOM.render(
      <div style={{ display: "flex" }}>
        {probeHeaders.map(({ columnIndex, columnSpan, value, column }) => (
          <div
            className="fake-column"
            title={columnIndex + "-" + columnSpan}
            key={Math.random()}
          >
            {this.renderHeader({ style: {}, value, column, columnIndex: 0, sortOrder: 'asc' })}
          </div>
        ))}
        {cols.map((column, columnIndex) => probeRows.map(probeRow =>
          (<div
                className="fake-column"
                title={columnIndex + "-" + (probeRow.colSpan || 1)}
                key={Math.random()}
              >
              {this.renderCell(
                probeRow,
                column,
                columnIndex,
                "key: " + Math.random(),
                0,
                true,
                {},
              )}

              </div>)))
                }

        ))}
      </div>,
      this._div,
      () => {
        let contentWidths = [].map.call(
          this._div.getElementsByClassName("fake-column"),
          columnElement => {
            const splittedKey = columnElement.title.split("-");
            const columnIndex = parseInt(splittedKey[0]);
            const columnSpan = parseInt(splittedKey[1]);
            return {
              columnIndex,
              columnSpan,
              offsetWidth: columnElement.offsetWidth,
            };
          },
        );

        contentWidths = orderBy(contentWidths, [
          "columnSpan",
          "columnIndex",
        ]).reduce(computeWidths, []);

        let columnWidths: number[] = cols.map((col, index) => {
          if (this.columnNeedsResize) {
            if (
              this.columnNeedsResize[index] &&
              !this.columnHasResized[index]
            ) {
              this.columnHasResized[index] = true;
              return contentWidths[index] + 1; // + 1 to make sure it doen't wrap?
            } else if (this.state.columnWidths[index]) {
              return this.state.columnWidths[index];
            } else {
              return 0;
            }
          } else {
            return contentWidths[index] + 1;
          }
        });

        ReactDOM.unmountComponentAtNode(this._div);

        delete this.columnNeedsResize;

        this.setState({ contentWidths, columnWidths }, this.recomputeGridSize);
      },
    );
  };

  recomputeGridSize = () => {
    if (this.header && this.grid) {
      this.header.recomputeGridSize();
      this.grid.recomputeGridSize();
    }
  };

  onColumnResize(columnIndex: number, columnSpan: number, width: number) {

    const { settings } = this.props;
    const columnWidthsSetting = settings["summaryTable.column_widths"]
      ? settings["summaryTable.column_widths"].slice()
      : [];

    const { columnWidths } = this.state;
    const updated = computeNewWidths(columnWidths,
      { columnIndex, columnSpan, offsetWidth : width });

    updated.reduce((acc, currentElem, index) => set(acc, index + columnIndex, currentElem), columnWidthsSetting);

    this.props.onUpdateVisualizationSettings({
      "summaryTable.column_widths": columnWidthsSetting,
    });
    setTimeout(() => this.recomputeGridSize(), 1);
  }

  cellRenderer = (
    { key, style, rowIndex, columnIndex }: CellRendererProps,
  ) => {
    const groupingManager = this.props.data;

    const { data, onVisualizationClick, visualizationIsClickable } = this.props;
    const { rows, cols, isGrouped } = data;
    const column = cols[columnIndex];
    const row = rows[rowIndex];
    const isGrandTotal =
      row.isTotalColumnIndex === 0 &&
      groupingManager.rows.length - 1 === rowIndex;

    const columnIsGrouped = isGrouped(columnIndex);

    return this.renderCell(
      row,
      column,
      columnIndex,
      key,
      rowIndex,
      isGrandTotal,
      style,
      onVisualizationClick,
      visualizationIsClickable,
      columnIsGrouped
    );
  };

  renderCell = (
    row,
    column,
    columnIndex,
    key,
    rowIndex,
    isGrandTotal,
    style,
    onVisualizationClick,
    visualizationIsClickable,
    columnIsGrouped,
  ): (RenderCellType => void) => {
    let value = column.getValue(row);

    const isTotalCell = row.isTotalColumnIndex === columnIndex + 1;
    const isTotalRow = Number.isInteger(row.isTotalColumnIndex);
    const isGrandTotalCell = isGrandTotal && columnIndex === 0;

    let formattedRes = formatValue(value, {
      column: column,
      type: "cell",
      jsx: true,
      rich: true,
    });

    if (isGrandTotalCell)
      formattedRes = "Grand totals";
    if (isTotalCell && typeof formattedRes === "string")
      formattedRes = "Totals for " + formattedRes;

    const clicked = getTableCellClickedObjectForSummary(
      this.props.data.cols,
      column,
      row,
      value,
    );

    const isClickable =
      onVisualizationClick && visualizationIsClickable(clicked);

    return (
      <div
        key={key}
        style={style}
        className={cx("TableInteractiveSummary-cellWrapper", {
          "TableInteractiveSummary-cellWrapper--firstColumn": columnIndex === 0,
          "TableInteractiveSummary-cellWrapper--lastColumn":
            columnIndex === this.props.data.cols.length - 1,
          "TableInteractiveSummary-cellWrapper-grandTotal": isGrandTotal,
          "TableInteractiveSummary-cellWrapper-total" : isTotalRow && !isGrandTotal,
          "TableInteractiveSummary-cellWrapper-normal" : !isTotalRow && !isGrandTotal,
          "TableInteractiveSummary-cellWrapper-normalGrouped" : !isTotalRow && !isGrandTotal && columnIsGrouped,
          "cursor-pointer": isClickable,
          "justify-end": !isTotalCell && !isGrandTotalCell && isColumnRightAligned(column),
          link: !isTotalRow && isClickable && isID(column),
        })}
        onMouseUp={
          isClickable
            ? e => {
                onVisualizationClick({ ...clicked, element: e.currentTarget });
              }
            : undefined
        }
      >
        <div className="cellData">
          {/* using formatValue instead of <Value> here for performance. The later wraps in an extra <span> */}
          {formattedRes}
        </div>
      </div>
    );
  };

  tableHeaderRenderer = ({
    key,
    style,
    columnIndex,
    rowIndex,
  }: CellRendererProps) => {
    const { columnsHeaders } = this.props.data;
    const columnHeader = columnsHeaders[rowIndex][columnIndex];
    if(!columnHeader){
      return null;
    }

    const sortOrder =  this.props.sort[columnHeader.column.name];
    return this.renderHeader({ ...columnHeader, key, style, columnIndex, sortOrder});
  };

  getRealSortOrderFromSettings = (columnName : ColumnName) => {
    const settings : SummaryTableSettings = this.props.summarySettings;
    const isAsc = (settings.columnNameToMetadata[columnName] || {}).isAscSortOrder;
    return isAsc === false ?  'desc' : 'asc';
  };

  canSort = (columnName : ColumnName) => {
    const settings : SummaryTableSettings = this.props.summarySettings;
    return settings.groupsSources.includes(columnName) || settings.columnsSource.includes(columnName);
  };

  renderHeader = ({
    key,
    style,
    column,
    value,
    columnIndex,
    columnSpan,
    displayText,
    sortOrder
  }: CellRendererProps) => {
    columnSpan = columnSpan || 1;
    const { onVisualizationClick, visualizationIsClickable, data:{ cols } } = this.props;

    const columnName = column.name;

    const summaryHeaderCustomSort = this.canSort(columnName) &&
      { currentSortOrder: sortOrder || this.getRealSortOrderFromSettings(columnName),
        customAction : () =>  this.props.updateSort(column.name)};
    const clicked = summaryHeaderCustomSort && {value, column, summaryHeaderCustomSort} ;

    let columnTitle = displayText || (value || value === 0
      ? formatValue(value, {
          column: column,
          type: "cell",
          jsx: true,
          rich: true,
        })
      : column && formatColumn(column));

    const isClickable = onVisualizationClick && visualizationIsClickable(clicked);


    const isSortable = isClickable && sortOrder;
    const isRightAligned =  columnSpan > 1 || isColumnRightAligned(cols[columnIndex]);

    return (
      <div>
        <div
          key={key}
          style={{
            ...style,
            overflow: "visible" /* ensure resize handle is visible */,
          }}
          className={cx(
            "TableInteractiveSummary-headerCellWrapper TableInteractiveSummary-headerCellData",
            {
              "TableInteractiveSummary-headerCellData--sorted": !!sortOrder,
              "cursor-pointer": isClickable,
              "justify-end": isRightAligned,
              "TableInteractiveSummary-mergedHeaderMarker":columnSpan > 1,
            },
          )}
          // use onMouseUp instead of onClick since we can stopPropation when resizing headers
          onMouseUp={
            isClickable
              ? e => {
                  onVisualizationClick({ ...clicked, element: e.currentTarget });
                }
              : undefined
          }
        >
          <div className={cx("cellData", {})}>
            {isSortable &&
              isRightAligned && (
                <Icon
                  className="Icon mr1"
                  name={sortOrder === 'asc' ? "chevronup" : "chevrondown"}
                  size={8}
                />
              )}
            {columnTitle}
            {isSortable &&
            !isRightAligned &&
              <Icon
                  className="Icon ml1"
                  name={sortOrder === 'asc' ? "chevronup" : "chevrondown"}
                  size={8}
                />
              }
          </div>
          <Draggable
            axis="x"
            bounds={{ left: RESIZE_HANDLE_WIDTH }}
            position={{ x: style.width, y: 0 }}
            onStop={(e, { x }) => {
              // prevent onVisualizationClick from being fired
              e.stopPropagation();
              this.onColumnResize(columnIndex, columnSpan, x);
            }}
          >
            <div
              className="bg-brand-hover bg-brand-active"
              style={{
                zIndex: 99,
                position: "absolute",
                width: RESIZE_HANDLE_WIDTH,
                top: 0,
                bottom: 0,
                left: -RESIZE_HANDLE_WIDTH - 1,
                cursor: "ew-resize",
              }}
            />
          </Draggable>

        </div>
        {/*{don't remove it, it is bottom border}*/}
      </div>
    );
  };

  getColumnWidth = ({ index }: { index: number }) => {
    const { settings } = this.props;
    const { columnWidths } = this.state;
    const columnWidthsSetting = settings["summaryTable.column_widths"] || [];
    return (
      columnWidthsSetting[index] || columnWidths[index] || MIN_COLUMN_WIDTH
    );
  };

  render() {
    const {
      width,
      height,
      data: { cols, rows, columnsHeaders, columnIndexToFirstInGroupIndexes, totalsRows },
      className
    } = this.props;
    if (!width || !height) {
      return <div className={className} />;
    }
    const headerHeight = HEADER_HEIGHT * columnsHeaders.length;

    const groupsForRows = columnsHeaders.map(createArgsForIndexGenerator );

    return (
      <ScrollSync>
        {({
          clientHeight,
          clientWidth,
          onScroll,
          scrollHeight,
          scrollLeft,
        }) => (
          <div
            className={cx(className, "TableInteractiveSummary relative", this.state.contentWidths && "TableInteractiveSummary--ready")}
          >
            <canvas
              className="spread"
              style={{ pointerEvents: "none", zIndex: 999 }}
              width={width}
              height={height}
            />
            <Grid
              ref={ref => (this.header = ref)}
              style={{
                top: 0,
                left: 0,
                right: 0,
                position: "absolute",
                overflow: "hidden",
              }}
              className="TableInteractiveSummary-header scroll-hide-all"
              width={width || 0}
              height={headerHeight}
              rowCount={columnsHeaders.length}
              rowHeight={HEADER_HEIGHT}
              // HACK: there might be a better way to do this, but add a phantom padding cell at the end to ensure scroll stays synced if main content scrollbars are visible
              columnCount={columnsHeaders[0].length + 1}
              columnWidth={props =>
                props.index < cols.length ? this.getColumnWidth(props) : 50
              }
              cellRenderer={props =>
                props.columnIndex < cols.length
                  ? this.tableHeaderRenderer(props)
                  : null
              }
              cellRangeRenderer={buildCellRangeRenderer(buildIndexGenerator({groupsForRows}))}
              onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
              scrollLeft={scrollLeft}
              tabIndex={null}
            />
            <Grid
              ref={ref => (this.grid = ref)}
              style={{
                top: headerHeight,
                left: 0,
                right: 0,
                bottom: 0,
                position: "absolute",
              }}
              className=""
              width={width}
              height={height - headerHeight}
              columnCount={cols.length}
              columnWidth={this.getColumnWidth}
              rowCount={rows.length}
              rowHeight={ROW_HEIGHT}
              onScroll={({ scrollLeft }) => {
                this.props.onActionDismissal();
                return onScroll({ scrollLeft });
              }}
              scrollLeft={scrollLeft}
              tabIndex={null}
              overscanRowCount={20}
              cellRenderer={this.cellRenderer}
              cellRangeRenderer={
                buildCellRangeRenderer(buildIndexGenerator({groupsForColumns: columnIndexToFirstInGroupIndexes, groupsForRows: totalsRows}))

              }
            />
          </div>
        )}
      </ScrollSync>
    );
  }
}


const createArgsForIndexGenerator = (cells) => cells.reduce(({acc, shouldIgnoreNulls}, cell, index) =>
{
  if(cell){
    const span = cell.columnSpan || 1;
    return {acc : set(acc, index, index + span -1), shouldIgnoreNulls : true};
  }
  if(shouldIgnoreNulls)
    return {acc, shouldIgnoreNulls};

  return {acc:set(acc, index, index)};
} , {acc:{}} ).acc;

const computeWidths = (
  widths: Number[],
  rangeInfo,
) => {
  const { columnIndex, columnSpan, offsetWidth } = rangeInfo;
  const lastIndex = columnIndex + columnSpan-1;
  //force resize if necessary
  widths[lastIndex] = widths[lastIndex];

  const subsetToModify = widths
    .slice(columnIndex, columnIndex + columnSpan)
    .map(p => p || MIN_COLUMN_WIDTH);
  const currentLen = subsetToModify.reduce((acc, elem) => acc + elem , 0);
  if (currentLen < offsetWidth) {
    const toUpdate = computeNewWidths(widths, rangeInfo);
    return toUpdate.reduce((acc, value, index) => set(acc, columnIndex + index ,value), widths);
  }
  return widths;
};


const computeNewWidths = (
  currentWidths: Number[],
  { columnIndex, columnSpan, offsetWidth }
) => {

  const subsetToUpdate = currentWidths
    .slice(columnIndex, columnIndex + columnSpan)
    .map(p => p || MIN_COLUMN_WIDTH);
  const subsetLen = subsetToUpdate.reduce((acc, elem) => acc + elem, 0);
  const multiplier = offsetWidth / subsetLen;
  return subsetToUpdate.map(p => Math.max(p * multiplier, MIN_COLUMN_WIDTH));
};

