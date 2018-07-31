/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "c-3po";
import "./TableInteractive.css";

import Icon from "metabase/components/Icon.jsx";

import { formatValue, formatColumn } from "metabase/lib/formatting";
import { isID } from "metabase/lib/schema_metadata";
import {
  getTableCellClickedObject,
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";

import _ from "underscore";
import cx from "classnames";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";

// $FlowFixMe: had to ignore react-virtualized in flow, probably due to different version
import { Grid, ScrollSync, defaultCellRangeRenderer } from "react-virtualized";
import Draggable from "react-draggable";

const SINGLE_HEADER_HEIGHT = 36;
const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 30;
const MIN_COLUMN_WIDTH = ROW_HEIGHT;
const RESIZE_HANDLE_WIDTH = 5;

import type { VisualizationProps } from "metabase/meta/types/Visualization";
import type {Row, Column} from "metabase/meta/types/Dataset";

type Props = VisualizationProps & {
  width: number,
  height: number,
  sort: any,
  isPivoted: boolean,
  onActionDismissal: () => void,
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

type CellRangeProps ={
  visibleRowIndices: Range,
  visibleColumnIndices: Range
};

type Range = {start : Number, stop: Number};

type RenderCellType = {
  row : Row,
  column: Column,columnIndex : number, visibleRowIndices:Range, key:string, rowIndex:number, isGrandTotal:boolean,   style: { [key: string]: any },
  onVisualizationClick : Function,
  visualizationIsClickable : Function,
}

type GridComponent = Component<void, void, void> & {
  recomputeGridSize: () => void,
};

@ExplicitSize
export default class TableInteractiveSummary extends Component {
  state: State;
  props: Props;

  columnHasResized: { [key: number]: boolean };
  columnNeedsResize: { [key: number]: boolean };
  _div: HTMLElement;

  lowerHeader: GridComponent;
  upperHeader: GridComponent;
  grid: GridComponent;

  constructor(props: Props) {
    super(props);

    this.state = {
      columnWidths: [],
      contentWidths: null,
    };
    this.columnHasResized = {};
  }

  static propTypes = {
    data: PropTypes.object.isRequired,
    isPivoted: PropTypes.bool.isRequired,
    sort: PropTypes.array,
  };

  static defaultProps = {
    isPivoted: false,
  };

  componentWillMount() {
    // for measuring cells:
    this._div = document.createElement("div");
    this._div.className = "TableInteractive";
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
    let { data: { cols, rows, probeRows, probeCols, valueColsLen } } = this.props;
    //todo: benchmark it
    probeCols = cols;
    valueColsLen = 0;

    ReactDOM.render(
      <div style={{display: "flex"}}>
        {probeCols.map((column, columnIndex) => (
          <div className="fake-column" key={"column1-" + columnIndex}>
            {this.tableLowerHeaderRenderer({
              columnIndex,
              rowIndex: 0,
              key: "lowerHeader",
              style: {},
            })}
            {probeRows.map((probeRow, ri) => this.renderCell(probeRow, column, columnIndex, { start: 0, stop : rows.length}, "column-" + columnIndex + " row1-" + ri, 0, true, {}
              ))}
          </div>
        ))}
      </div>,
      this._div,
      () => {
        let contentWidths = [].map.call(
          this._div.getElementsByClassName("fake-column"),
          columnElement => columnElement.offsetWidth,
        );

        const diff = cols.length - probeCols.length;
        if(diff > 0){
          const toDuplicate = contentWidths.slice(contentWidths.length-valueColsLen);
          contentWidths = [...contentWidths,...Array.from(Array(diff).keys()).map(p => p % valueColsLen).map(p => toDuplicate[p])]
        }

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
  }

  recomputeGridSize = () => {
    if (this.lowerHeader && this.upperHeader && this.grid) {
      this.lowerHeader.recomputeGridSize();
      this.upperHeader.recomputeGridSize();
      this.grid.recomputeGridSize();
    }
  };

  recomputeColumnSizes = _.debounce(() => {
    this.setState({ contentWidths: null });
  }, 100);

  onCellResize(columnIndex: number) {
    this.columnNeedsResize = this.columnNeedsResize || {};
    this.columnNeedsResize[columnIndex] = true;
    this.recomputeColumnSizes();
  }

  onColumnResize(columnIndex: number, width: number) {
    const { settings } = this.props;
    let columnWidthsSetting = settings["summaryTable.column_widths"]
      ? settings["summaryTable.column_widths"].slice()
      : [];
    columnWidthsSetting[columnIndex] = Math.max(MIN_COLUMN_WIDTH, width);
    this.props.onUpdateVisualizationSettings({
      "summaryTable.column_widths": columnWidthsSetting,
    });
    setTimeout(() => this.recomputeGridSize(), 1);
  }


  cellRenderer = ({visibleRowIndices, visibleColumnIndices, aa}: CellRangeProps, { key, style, rowIndex, columnIndex }: CellRendererProps) => {
    const groupingManager = this.props.data;

    if(!groupingManager.isVisible(rowIndex, columnIndex, visibleRowIndices)) {
        return null;
    }
    const {
      data,
      onVisualizationClick,
      visualizationIsClickable,
    } = this.props;
    const { rows, cols } = data;
    const column = cols[columnIndex];
    const row = rows[rowIndex];
    const isGrandTotal = row.isTotalColumnIndex === 0 && groupingManager.rows.length-1 === rowIndex;
    return this.renderCell(row, column, columnIndex, visibleRowIndices, key, rowIndex, isGrandTotal, style, onVisualizationClick,visualizationIsClickable);

  };



  renderCell = (row, column,columnIndex, visibleRowIndices, key, rowIndex, isGrandTotal, style, onVisualizationClick, visualizationIsClickable ) : (RenderCellType => void) =>{
    const groupingManager = this.props.data;
    let value = column.getValue(row);


    if (isGrandTotal && columnIndex === 0)
      value = 'Grand totals';

    let mappedStyle = {... groupingManager.mapStyle(rowIndex, columnIndex, visibleRowIndices, style)};
    if(isGrandTotal)
      mappedStyle = {... mappedStyle, background: '#509ee3', color: 'white', 'font-weight':'bold'};
    else if (row.isTotalColumnIndex && row.isTotalColumnIndex <= columnIndex +1)
      mappedStyle = {... mappedStyle, background: '#EDEFF0', color: '#6E757C', 'font-weight':'bold' };

    if(groupingManager.isGrouped(columnIndex))
      key = key + (columnIndex + '-' + Array.from(Array(columnIndex+1).keys()).map(i => row[i] || 'dd').join('-')) + (row.isTotalColumnIndex || '');

    const clicked = getTableCellClickedObject(
      this.props.data,
      rowIndex,
      columnIndex,
      false,
    );
    const isClickable =
      onVisualizationClick && visualizationIsClickable(clicked);

    let formatedRes = formatValue(value, {
      column: column,
      type: "cell",
      jsx: true,
      rich: true,
      isTotal : row.isTotalColumnIndex === columnIndex + 1
    });

    if(row.isTotalColumnIndex === columnIndex + 1 && typeof formatedRes === 'string')
      formatedRes = 'Totals for ' + formatedRes;

    return (
      <div
        key={key}
        style={mappedStyle}
        className={cx("TableInteractive-cellWrapper", {
          "TableInteractive-cellWrapper--firstColumn": columnIndex === 0,
          "TableInteractive-cellWrapper--lastColumn":
          columnIndex === this.props.data.cols.length - 1,
          "cursor-pointer": isClickable,
          "justify-end": isColumnRightAligned(column),
          link: isClickable && isID(column),
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
          {formatedRes}
        </div>
      </div>
    );
  }

  tableUpperHeaderRenderer = ({ key, style, columnIndex }: CellRendererProps, group) => {
    const {
      sort,
      isPivoted,
      onVisualizationClick,
      visualizationIsClickable,
    } = this.props;
    const { cols } = this.props.data;
    const column = cols[columnIndex];

    let columnTitle = formatColumn(column);
    if (!columnTitle && this.props.isPivoted && columnIndex !== 0) {
      columnTitle = t`Unset`;
    }

    let clicked;
    if (isPivoted) {
      // if it's a pivot table, the first column is
      if (columnIndex >= 0) {
        clicked = column._dimension;
      }
    } else {
      clicked = { column };
    }

    const isClickable =
      onVisualizationClick && visualizationIsClickable(clicked);

    // the column id is in `["field-id", fieldId]` format
    return (
      <div
        key={key}
        style={{
          ...style,
          paddingBottom: 5,
          overflow: "visible" /* ensure resize handle is visible */,
        }}
        className={cx(
          "TableInteractive-upperHeadlineCellWrapper TableInteractive-headerCellData",
          {
            "TableInteractive-cellWrapper--firstColumn": columnIndex === 0,
            "TableInteractive-cellWrapper--lastColumn": columnIndex === cols.length - 1,
            "cursor-pointer": isClickable,
//            "justify-end": false,
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
        <div
          className={cx(
            {
              "groupName": group.name,
            }
          )}
        >
          <div className="cellData"
            style={{
               marginBottom: 0
            }}>
            {formatValue(group.name, {
              column: group.columnInfo,
              type: "cell",
              jsx: true,
              rich: true
            })}
          </div>
        </div>
      </div>
    );
  };

  tableLowerHeaderRenderer = ({ key, style, columnIndex }: CellRendererProps) => {
    const {
      sort,
      isPivoted,
      onVisualizationClick,
      visualizationIsClickable,
    } = this.props;
    const { cols } = this.props.data;
    const column = cols[columnIndex];

    let columnTitle = column && formatColumn(column);
    if (!columnTitle && this.props.isPivoted && columnIndex !== 0) {
      columnTitle = t`Unset`;
    }

    let clicked;
    if (isPivoted) {
      // if it's a pivot table, the first column is
      if (columnIndex >= 0) {
        clicked = column._dimension;
      }
    } else {
      clicked = { column };
    }

    const isClickable =
      onVisualizationClick && visualizationIsClickable(clicked);
    const isSortable = isClickable && column.source;
    const isRightAligned = isColumnRightAligned(column);

    // the column id is in `["field-id", fieldId]` format
    const isSorted =
      sort && sort[0] && sort[0][0] && sort[0][0][1] === column.id;
    const isAscending = sort && sort[0] && sort[0][1] === "ascending";


    return (
      <div
        key={key}
        style={{
          ...style,
          overflow: "visible" /* ensure resize handle is visible */,
        }}
        className={cx(
          "TableInteractive-cellWrapper TableInteractive-headerCellData",
          {
            "TableInteractive-headerCellData--sorted": isSorted,
            "cursor-pointer": isClickable,
            "justify-end": isRightAligned,
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
        <div className="cellData">
          {isSortable &&
          isRightAligned && (
            <Icon
              className="Icon mr1"
              name={isAscending ? "chevronup" : "chevrondown"}
              size={8}
            />
          )}
          {columnTitle}
          {isSortable &&
          !isRightAligned && (
            <Icon
              className="Icon ml1"
              name={isAscending ? "chevronup" : "chevrondown"}
              size={8}
            />
          )}
        </div>
        <Draggable
          axis="x"
          bounds={{ left: RESIZE_HANDLE_WIDTH }}
          position={{ x: this.getColumnWidth({ index: columnIndex }), y: 0 }}
          onStop={(e, { x }) => {
            // prevent onVisualizationClick from being fired
            e.stopPropagation();
            this.onColumnResize(columnIndex, x);
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
    const { width, height, data: { cols, rows }, className } = this.props;
    if (!width || !height) {
      return <div className={className} />;
    }

    let groups = cols.filter( c => c.parentName ).map( ({parentName}) => ({name: parentName[0], indexFrom: 0, indexTo: parentName[1], columnInfo: parentName[2]}));

    let isUpperHeaderEmpty ="";
    let idx= 0;
    for( let i in groups ) {
      let g = groups[i];
      g.indexFrom = idx;
      idx += g.indexTo;
      g.indexTo = idx;
      isUpperHeaderEmpty += g.name;
    }

    isUpperHeaderEmpty = isUpperHeaderEmpty == "";

    return (
      <ScrollSync>
        {({
          clientHeight,
          clientWidth,
          onScroll,
          scrollHeight,
          scrollLeft
        }) => (
          <div
            className={cx(className, "TableInteractive relative", {
              "TableInteractive--pivot": this.props.isPivoted,
              "TableInteractive--ready": this.state.contentWidths
            })}
          >
            <canvas
              className="spread"
              style={{ pointerEvents: "none", zIndex: 999 }}
              width={width}
              height={height}
            />
            <Grid
              ref={ref => (this.upperHeader = ref)}
              style={{
                top: 0,
                left: 0,
                right: 0,
                height: HEADER_HEIGHT,
                position: "absolute",
                overflow: "hidden",
                visibility: isUpperHeaderEmpty ? "hidden" : "normal",
              }}
              className="scroll-hide-all"
              width={width || 0}
              height={HEADER_HEIGHT}
              rowCount={1}
              rowHeight={HEADER_HEIGHT}
              // HACK: there might be a better way to do this, but add a phantom padding cell at the end to ensure scroll stays synced if main content scrollbars are visible
              columnCount={groups.length + 1}
              columnWidth={
                props => {
                  if( props.index < groups.length ) {
                    let g=groups[props.index];
                    let wd = 0;
                    for( let idx2=g.indexFrom ; idx2<g.indexTo ; ++idx2 )
                      wd += this.getColumnWidth({index:idx2});
                    return wd;

                  }
                  else
                      return 50;
                }
              }
              cellRenderer={props =>
                props.columnIndex < groups.length
                  ? this.tableUpperHeaderRenderer(props,groups[props.columnIndex])
                  : null
              }
              onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
              scrollLeft={scrollLeft}
              tabIndex={null}
            />
            <Grid
              ref={ref => (this.lowerHeader = ref)}
              style={{
                top: isUpperHeaderEmpty ? 0 : HEADER_HEIGHT,
                left: 0,
                right: 0,
                height: isUpperHeaderEmpty ? SINGLE_HEADER_HEIGHT : HEADER_HEIGHT,
                position: "absolute",
                overflow: "hidden",
              }}
              className="TableInteractive-header scroll-hide-all"
              width={width || 0}
              height={isUpperHeaderEmpty ? SINGLE_HEADER_HEIGHT : HEADER_HEIGHT}
              rowCount={1}
              rowHeight={isUpperHeaderEmpty ? SINGLE_HEADER_HEIGHT : HEADER_HEIGHT}
              // HACK: there might be a better way to do this, but add a phantom padding cell at the end to ensure scroll stays synced if main content scrollbars are visible
              columnCount={cols.length + 1}
              columnWidth={props =>
                props.index < cols.length ? this.getColumnWidth(props) : 50
              }
              cellRenderer={props =>
                props.columnIndex < cols.length
                  ? this.tableLowerHeaderRenderer(props)
                  : null
              }
              onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
              scrollLeft={scrollLeft}
              tabIndex={null}
            />
            <Grid
              ref={ref => (this.grid = ref)}
              style={{
                top: isUpperHeaderEmpty ? SINGLE_HEADER_HEIGHT : HEADER_HEIGHT*2,
                left: 0,
                right: 0,
                bottom: 0,
                position: "absolute",
              }}
              className=""
              width={width}
              height={height - (isUpperHeaderEmpty ? SINGLE_HEADER_HEIGHT : 2*HEADER_HEIGHT)}
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
              cellRangeRenderer={rangeArgs => {
                const res = defaultCellRangeRenderer({...rangeArgs, cellRenderer: (renderArgs => this.cellRenderer(rangeArgs, renderArgs))});

                                // console.log(res[0]);
                const a = []
                return res.filter(p => {
                  const r = a.indexOf(p.key) === -1;
                  if(r)
                    a.push(p.key);

                  return r;
                });
              }}
            />
          </div>
        )}
      </ScrollSync>
    );
  }
}
