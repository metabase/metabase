/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";
import cx from "classnames";
import Draggable from "react-draggable";
import { Grid, ScrollSync } from "react-virtualized";

import "./TableInteractive.css";

import { Icon } from "metabase/core/components/Icon";
import ExternalLink from "metabase/core/components/ExternalLink";
import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";

import { formatValue } from "metabase/lib/formatting";
import {
  getTableCellClickedObject,
  getTableHeaderClickedObject,
  getTableClickedObjectRowData,
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";
import { getScrollBarSize } from "metabase/lib/dom";
import { zoomInRow } from "metabase/query_builder/actions";
import { getQueryBuilderMode } from "metabase/query_builder/selectors";

import ExplicitSize from "metabase/components/ExplicitSize";

import Ellipsified from "metabase/core/components/Ellipsified";
import DimensionInfoPopover from "metabase/components/MetadataInfo/DimensionInfoPopover";
import { isID, isPK, isFK } from "metabase-lib/types/utils/isa";
import { fieldRefForColumn } from "metabase-lib/queries/utils/dataset";
import Dimension from "metabase-lib/Dimension";
import { memoizeClass } from "metabase-lib/utils";
import { isAdHocModelQuestionCard } from "metabase-lib/metadata/utils/models";
import MiniBar from "../MiniBar";
import {
  ExpandButton,
  HeaderCell,
  ResizeHandle,
} from "./TableInteractive.styled";

// approximately 120 chars
const TRUNCATE_WIDTH = 780;

const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 36;
const SIDEBAR_WIDTH = 38;

const MIN_COLUMN_WIDTH = ROW_HEIGHT;
const RESIZE_HANDLE_WIDTH = 5;
// if header is dragged fewer than than this number of pixels we consider it a click instead of a drag
const HEADER_DRAG_THRESHOLD = 5;

// HACK: used to get react-draggable to reset after a drag
let DRAG_COUNTER = 0;

function pickRowsToMeasure(rows, columnIndex, count = 10) {
  const rowIndexes = [];
  // measure up to 10 non-nil cells
  for (
    let rowIndex = 0;
    rowIndex < rows.length && rowIndexes.length < count;
    rowIndex++
  ) {
    if (rows[rowIndex][columnIndex] != null) {
      rowIndexes.push(rowIndex);
    }
  }
  return rowIndexes;
}

const mapStateToProps = state => ({
  queryBuilderMode: getQueryBuilderMode(state),
});

const mapDispatchToProps = dispatch => ({
  onZoomRow: objectId => dispatch(zoomInRow({ objectId })),
});

class TableInteractive extends Component {
  constructor(props) {
    super(props);

    this.state = {
      columnIsExpanded: [],
      columnWidths: [],
      contentWidths: null,
      showDetailShortcut: true,
    };
    this.columnHasResized = {};
    this.headerRefs = [];
    this.detailShortcutRef = React.createRef();

    window.METABASE_TABLE = this;
  }

  static propTypes = {
    data: PropTypes.object.isRequired,
    isPivoted: PropTypes.bool.isRequired,
    sort: PropTypes.array,
  };

  static defaultProps = {
    isPivoted: false,
    hasMetadataPopovers: true,
    renderTableHeaderWrapper: children => (
      <div className="cellData">{children}</div>
    ),
    renderTableCellWrapper: children => (
      <div className={cx({ cellData: children != null && children !== "" })}>
        {children}
      </div>
    ),
  };

  UNSAFE_componentWillMount() {
    // for measuring cells:
    this._div = document.createElement("div");
    this._div.className = "TableInteractive";
    this._div.style.display = "inline-block";
    this._div.style.position = "absolute";
    this._div.style.visibility = "hidden";
    this._div.style.zIndex = "-1";
    document.body.appendChild(this._div);

    this._measure();
    this._findIDColumn(this.props.data, this.props.isPivoted);
    this._showDetailShortcut(this.props.query, this.props.isPivoted);
  }

  componentWillUnmount() {
    if (this._div && this._div.parentNode) {
      this._div.parentNode.removeChild(this._div);
    }
    document.removeEventListener("keydown", this.onKeyDown);
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    const { card, data } = this.props;
    const { card: nextCard, data: nextData } = newProps;

    const isDataChange =
      data && nextData && !_.isEqual(data.cols, nextData.cols);
    const isDatasetStatusChange =
      isAdHocModelQuestionCard(nextCard, card) ||
      isAdHocModelQuestionCard(card, nextCard);

    if (isDataChange && !isDatasetStatusChange) {
      this.resetColumnWidths();
    }

    // remeasure columns if the column settings change, e.x. turning on/off mini bar charts
    const oldColSettings = this._getColumnSettings(this.props);
    const newColSettings = this._getColumnSettings(newProps);
    if (!_.isEqual(oldColSettings, newColSettings)) {
      this.remeasureColumnWidths();
    }

    if (isDataChange) {
      this._findIDColumn(nextData, newProps.isPivoted);
      this._showDetailShortcut(this.props.query, this.props.isPivoted);
    }
  }

  _findIDColumn = (data, isPivoted = false) => {
    const hasManyPKColumns = data.cols.filter(isPK).length > 1;

    const pkIndex =
      isPivoted || hasManyPKColumns ? -1 : data.cols.findIndex(isPK);

    this.setState({
      IDColumnIndex: pkIndex === -1 ? null : pkIndex,
      IDColumn: pkIndex === -1 ? null : data.cols[pkIndex],
    });
    document.addEventListener("keydown", this.onKeyDown);
  };

  _showDetailShortcut = (query, isPivoted) => {
    const hasAggregation = !!query?.aggregations?.()?.length;
    const isNotebookPreview = this.props.queryBuilderMode === "notebook";
    const newShowDetailState = !(
      isPivoted ||
      hasAggregation ||
      isNotebookPreview
    );

    if (newShowDetailState !== this.state.showDetailShortcut) {
      this.setState({
        showDetailShortcut: newShowDetailState,
      });
      this.recomputeColumnSizes();
    }
  };

  _getColumnSettings(props) {
    return props.data && props.data.cols.map(col => props.settings.column(col));
  }

  shouldComponentUpdate(nextProps, nextState) {
    const PROP_KEYS = [
      "width",
      "height",
      "settings",
      "data",
      "clicked",
      "renderTableHeaderWrapper",
      "scrollToColumn",
    ];
    // compare specific props and state to determine if we should re-render
    return (
      !_.isEqual(
        _.pick(this.props, ...PROP_KEYS),
        _.pick(nextProps, ...PROP_KEYS),
      ) || !_.isEqual(this.state, nextState)
    );
  }

  componentDidUpdate(prevProps) {
    if (
      !this.state.contentWidths ||
      prevProps.renderTableHeaderWrapper !== this.props.renderTableHeaderWrapper
    ) {
      this._measure();
    } else if (this.props.onContentWidthChange) {
      const total = this.state.columnWidths.reduce((sum, width) => sum + width);
      if (this._totalContentWidth !== total) {
        this.props.onContentWidthChange(total, this.state.columnWidths);
        this._totalContentWidth = total;
      }
    }
  }

  remeasureColumnWidths() {
    this.setState({
      columnWidths: [],
      contentWidths: null,
      columnIsExpanded: [],
    });
    this.columnHasResized = {};
  }

  resetColumnWidths() {
    this.remeasureColumnWidths();
    this.props.onUpdateVisualizationSettings({
      "table.column_widths": undefined,
    });
  }

  _measure() {
    const {
      data: { cols, rows },
    } = this.props;

    ReactDOM.render(
      <div style={{ display: "flex" }}>
        {cols.map((column, columnIndex) => (
          <div className="fake-column" key={"column-" + columnIndex}>
            {this.tableHeaderRenderer({
              columnIndex,
              rowIndex: 0,
              key: "header",
              style: {},
              isVirtual: true,
            })}
            {pickRowsToMeasure(rows, columnIndex).map(rowIndex =>
              this.cellRenderer({
                rowIndex,
                columnIndex,
                key: "row-" + rowIndex,
                style: {},
              }),
            )}
          </div>
        ))}
      </div>,
      this._div,
      () => {
        const contentWidths = [].map.call(
          this._div.getElementsByClassName("fake-column"),
          columnElement => columnElement.offsetWidth,
        );

        const columnWidths = cols.map((col, index) => {
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

        // Doing this on next tick makes sure it actually gets removed on initial measure
        setTimeout(() => {
          ReactDOM.unmountComponentAtNode(this._div);
        }, 0);

        delete this.columnNeedsResize;

        this.setState({ contentWidths, columnWidths }, this.recomputeGridSize);
      },
    );
  }

  recomputeGridSize = () => {
    if (this.header && this.grid) {
      this.header.recomputeGridSize();
      this.grid.recomputeGridSize();
    }
  };

  recomputeColumnSizes = _.debounce(() => {
    this.setState({ contentWidths: null });
  }, 100);

  onCellResize(columnIndex) {
    this.columnNeedsResize = this.columnNeedsResize || {};
    this.columnNeedsResize[columnIndex] = true;
    this.recomputeColumnSizes();
  }

  onColumnResize(columnIndex, width) {
    const { settings } = this.props;
    const columnWidthsSetting = settings["table.column_widths"]
      ? settings["table.column_widths"].slice()
      : [];
    columnWidthsSetting[columnIndex] = Math.max(MIN_COLUMN_WIDTH, width);
    this.props.onUpdateVisualizationSettings({
      "table.column_widths": columnWidthsSetting,
    });
    setTimeout(() => this.recomputeGridSize(), 1);
  }

  onColumnReorder(columnIndex, newColumnIndex) {
    const { settings, onUpdateVisualizationSettings } = this.props;
    const columns = settings["table.columns"].slice(); // copy since splice mutates
    columns.splice(newColumnIndex, 0, columns.splice(columnIndex, 1)[0]);
    onUpdateVisualizationSettings({
      "table.columns": columns,
    });
  }

  onVisualizationClick(clicked, element) {
    const { onVisualizationClick } = this.props;
    if (this.visualizationIsClickable(clicked)) {
      onVisualizationClick({ ...clicked, element });
    }
  }

  getCellClickedObject(rowIndex, columnIndex) {
    try {
      return this._getCellClickedObjectCached(
        this.props.data,
        this.props.settings,
        rowIndex,
        columnIndex,
        this.props.isPivoted,
        this.props.series,
      );
    } catch (e) {
      console.error(e);
    }
  }
  // NOTE: all arguments must be passed to the memoized method, not taken from this.props etc
  _getCellClickedObjectCached(
    data,
    settings,
    rowIndex,
    columnIndex,
    isPivoted,
    series,
  ) {
    const clickedRowData = getTableClickedObjectRowData(
      series,
      rowIndex,
      columnIndex,
      isPivoted,
      data,
    );

    return getTableCellClickedObject(
      data,
      settings,
      rowIndex,
      columnIndex,
      isPivoted,
      clickedRowData,
    );
  }

  getHeaderClickedObject(columnIndex) {
    try {
      return getTableHeaderClickedObject(
        this.props.data,
        columnIndex,
        this.props.isPivoted,
        this.props.query,
      );
    } catch (e) {
      console.error(e);
    }
  }

  visualizationIsClickable(clicked) {
    try {
      const { onVisualizationClick, visualizationIsClickable } = this.props;
      const { dragColIndex } = this.state;
      if (
        // don't bother calling if we're dragging, but do it for headers to show isSortable
        (dragColIndex == null || (clicked && clicked.value === undefined)) &&
        onVisualizationClick &&
        visualizationIsClickable &&
        clicked
      ) {
        return this._visualizationIsClickableCached(
          visualizationIsClickable,
          clicked,
        );
      }
    } catch (e) {
      console.error(e);
    }
  }
  // NOTE: all arguments must be passed to the memoized method, not taken from this.props etc
  _visualizationIsClickableCached(visualizationIsClickable, clicked) {
    return visualizationIsClickable(clicked);
  }

  // NOTE: all arguments must be passed to the memoized method, not taken from this.props etc
  getCellBackgroundColor(settings, value, rowIndex, columnName) {
    try {
      return settings["table._cell_background_getter"](
        value,
        rowIndex,
        columnName,
      );
    } catch (e) {
      console.error(e);
    }
  }

  // NOTE: all arguments must be passed to the memoized method, not taken from this.props etc
  getCellFormattedValue(value, columnSettings, clicked) {
    try {
      return formatValue(value, {
        ...columnSettings,
        type: "cell",
        jsx: true,
        rich: true,
        clicked: clicked,
      });
    } catch (e) {
      console.error(e);
    }
  }

  pkClick = rowIndex => {
    const objectId = this.state.IDColumn
      ? this.props.data.rows[rowIndex][this.state.IDColumnIndex]
      : rowIndex;
    return e => this.props.onZoomRow(objectId);
  };

  onKeyDown = event => {
    const detailEl = this.detailShortcutRef.current;
    const visibleDetailButton =
      !!detailEl && Array.from(detailEl.classList).includes("show") && detailEl;
    const canViewRowDetail = !this.props.isPivoted && !!visibleDetailButton;

    if (event.key === "Enter" && canViewRowDetail) {
      const hoveredRowIndex = Number(detailEl.dataset.showDetailRowindex);
      this.pkClick(hoveredRowIndex)(event);
    }
  };

  cellRenderer = ({ key, style, rowIndex, columnIndex }) => {
    const { data, settings } = this.props;
    const { dragColIndex, showDetailShortcut } = this.state;
    const { rows, cols } = data;

    const column = cols[columnIndex];
    const row = rows[rowIndex];
    const value = row[columnIndex];

    const columnSettings = settings.column(column);
    const clicked = this.getCellClickedObject(rowIndex, columnIndex);

    const cellData = columnSettings["show_mini_bar"] ? (
      <MiniBar
        value={value}
        options={columnSettings}
        extent={getColumnExtent(data.cols, data.rows, columnIndex)}
        cellHeight={ROW_HEIGHT}
      />
    ) : (
      this.getCellFormattedValue(value, columnSettings, clicked)
      /* using formatValue instead of <Value> here for performance. The later wraps in an extra <span> */
    );

    const isLink = cellData && cellData.type === ExternalLink;
    const isClickable = !isLink && this.visualizationIsClickable(clicked);
    const backgroundColor = this.getCellBackgroundColor(
      settings,
      value,
      rowIndex,
      column.name,
    );

    const isCollapsed = this.isColumnWidthTruncated(columnIndex);

    return (
      <div
        key={key}
        style={{
          ...style,
          // use computed left if dragging
          left: this.getColumnLeft(style, columnIndex),
          // add a transition while dragging column
          transition: dragColIndex != null ? "left 200ms" : null,
          backgroundColor,
        }}
        className={cx(
          "TableInteractive-cellWrapper text-dark hover-parent hover--visibility",
          {
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
          },
        )}
        onClick={
          isClickable
            ? e => {
                this.onVisualizationClick(clicked, e.currentTarget);
              }
            : undefined
        }
        onKeyUp={
          isClickable
            ? e => {
                e.key === "Enter" &&
                  this.onVisualizationClick(clicked, e.currentTarget);
              }
            : undefined
        }
        onMouseEnter={
          showDetailShortcut ? e => this.handleHoverRow(e, rowIndex) : undefined
        }
        onMouseLeave={
          showDetailShortcut ? e => this.handleLeaveRow() : undefined
        }
        tabIndex="0"
      >
        {this.props.renderTableCellWrapper(cellData)}
        {isCollapsed && (
          <ExpandButton
            data-testid="expand-column"
            className="hover-child"
            small
            borderless
            iconSize={10}
            icon="ellipsis"
            onlyIcon
            onClick={e => this.handleExpandButtonClick(e, columnIndex)}
          />
        )}
      </div>
    );
  };

  handleExpandButtonClick = (e, columnIndex) => {
    e.stopPropagation();
    this.handleExpandColumn(columnIndex);
  };

  getDragColNewIndex(data) {
    const { columnPositions, dragColNewIndex, dragColStyle } = this.state;
    if (dragColStyle) {
      if (data.x < 0) {
        const left = dragColStyle.left + data.x;
        const index = _.findIndex(columnPositions, p => left < p.center);
        if (index >= 0) {
          return index;
        }
      } else if (data.x > 0) {
        const right = dragColStyle.left + dragColStyle.width + data.x;
        const index = _.findLastIndex(columnPositions, p => right > p.center);
        if (index >= 0) {
          return index;
        }
      }
    }
    return dragColNewIndex;
  }

  getColumnPositions = () => {
    let left = this.state.showDetailShortcut ? SIDEBAR_WIDTH : 0;
    return this.props.data.cols.map((col, index) => {
      const width = this.getColumnWidth({ index });
      const pos = {
        left,
        right: left + width,
        center: left + width / 2,
        width,
      };
      left += width;
      return pos;
    });
  };

  getNewColumnLefts = dragColNewIndex => {
    const { dragColIndex, columnPositions } = this.state;
    const { cols } = this.props.data;
    const indexes = cols.map((col, index) => index);
    indexes.splice(dragColNewIndex, 0, indexes.splice(dragColIndex, 1)[0]);
    let left = this.state.showDetailShortcut ? SIDEBAR_WIDTH : 0;
    const lefts = indexes.map(index => {
      const thisLeft = left;
      left += columnPositions[index].width;
      return { index, left: thisLeft };
    });
    lefts.sort((a, b) => a.index - b.index);
    return lefts.map(p => p.left);
  };

  getColumnLeft(style, index) {
    const { dragColNewIndex, dragColNewLefts } = this.state;
    if (dragColNewIndex != null && dragColNewLefts) {
      return dragColNewLefts[index];
    }
    return style.left;
  }

  getDimension(column, query) {
    if (!query) {
      return undefined;
    }

    return query.parseFieldReference(column.field_ref);
  }

  // TableInteractive renders invisible columns to remeasure the layout (see the _measure method)
  // After the measurements are done, invisible columns get unmounted.
  // Because table headers are wrapped into react-draggable, it can trigger
  // https://github.com/react-grid-layout/react-draggable/issues/315
  // (inputs loosing focus when draggable components unmount)
  // We need to prevent that by passing `enableUserSelectHack={false}`
  // to draggable components used in measurements
  // We should maybe rethink the approach to measurements or render a very basic table header, without react-draggable
  tableHeaderRenderer = ({ key, style, columnIndex, isVirtual = false }) => {
    const {
      data,
      sort,
      isPivoted,
      hasMetadataPopovers,
      getColumnTitle,
      renderTableHeaderWrapper,
    } = this.props;
    const { dragColIndex, showDetailShortcut } = this.state;
    const { cols } = data;
    const column = cols[columnIndex];

    const columnTitle = getColumnTitle(columnIndex);

    const clicked = this.getHeaderClickedObject(columnIndex);

    const isDraggable = !isPivoted;
    const isDragging = dragColIndex === columnIndex;
    const isClickable = this.visualizationIsClickable(clicked);
    const isSortable = isClickable && column.source && !isPivoted;
    const isRightAligned = isColumnRightAligned(column);

    // TODO MBQL: use query lib to get the sort field
    const fieldRef = fieldRefForColumn(column);
    const sortIndex = _.findIndex(
      sort,
      sort => sort[1] && Dimension.isEqual(sort[1], fieldRef),
    );
    const isSorted = sortIndex >= 0;
    const isAscending = isSorted && sort[sortIndex][0] === "asc";

    return (
      <Draggable
        /* needs to be index+name+counter so Draggable resets after each drag */
        enableUserSelectHack={!isVirtual}
        key={columnIndex + column.name + DRAG_COUNTER}
        axis="x"
        disabled={!isDraggable}
        onStart={(e, d) => {
          this.setState({
            columnPositions: this.getColumnPositions(),
            dragColIndex: columnIndex,
            dragColStyle: style,
            dragColNewIndex: columnIndex,
          });
        }}
        onDrag={(e, data) => {
          const newIndex = this.getDragColNewIndex(data);
          if (newIndex != null && newIndex !== this.state.dragColNewIndex) {
            this.setState({
              dragColNewIndex: newIndex,
              dragColNewLefts: this.getNewColumnLefts(newIndex),
            });
          }
        }}
        onStop={(e, d) => {
          const { dragColIndex, dragColNewIndex } = this.state;
          DRAG_COUNTER++;
          if (
            dragColIndex != null &&
            dragColNewIndex != null &&
            dragColIndex !== dragColNewIndex
          ) {
            this.onColumnReorder(dragColIndex, dragColNewIndex);
          } else if (Math.abs(d.x) + Math.abs(d.y) < HEADER_DRAG_THRESHOLD) {
            // in setTimeout since headers will be rerendered due to DRAG_COUNTER changing
            setTimeout(() => {
              this.onVisualizationClick(clicked, this.headerRefs[columnIndex]);
            });
          }
          this.setState({
            columnPositions: null,
            dragColIndex: null,
            dragColStyle: null,
            dragColNewIndex: null,
            dragColNewLefts: null,
          });
        }}
      >
        <HeaderCell
          data-testid="header-cell"
          ref={e => (this.headerRefs[columnIndex] = e)}
          style={{
            ...style,
            overflow: "visible" /* ensure resize handle is visible */,
            // use computed left if dragging, except for the dragged header
            left: isDragging
              ? style.left
              : this.getColumnLeft(style, columnIndex),
          }}
          className={cx(
            "TableInteractive-cellWrapper TableInteractive-headerCellData",
            {
              "TableInteractive-cellWrapper--firstColumn": columnIndex === 0,
              padLeft: columnIndex === 0 && !showDetailShortcut,
              "TableInteractive-cellWrapper--lastColumn":
                columnIndex === cols.length - 1,
              "TableInteractive-cellWrapper--active": isDragging,
              "TableInteractive-headerCellData--sorted": isSorted,
              "cursor-pointer": isClickable,
              "justify-end": isRightAligned,
            },
          )}
          onClick={
            // only use the onClick if not draggable since it's also handled in Draggable's onStop
            isClickable && !isDraggable
              ? e => {
                  this.onVisualizationClick(clicked, e.currentTarget);
                }
              : undefined
          }
        >
          <DimensionInfoPopover
            placement="bottom-start"
            dimension={
              hasMetadataPopovers
                ? this.getDimension(column, this.props.query)
                : null
            }
            disabled={this.props.clicked != null}
          >
            {renderTableHeaderWrapper(
              <Ellipsified tooltip={columnTitle}>
                {isSortable && isRightAligned && (
                  <Icon
                    className="Icon mr1"
                    name={isAscending ? "chevronup" : "chevrondown"}
                    size={10}
                  />
                )}
                {columnTitle}
                {isSortable && !isRightAligned && (
                  <Icon
                    className="Icon ml1"
                    name={isAscending ? "chevronup" : "chevrondown"}
                    size={10}
                  />
                )}
              </Ellipsified>,
              column,
              columnIndex,
            )}
          </DimensionInfoPopover>
          <Draggable
            enableUserSelectHack={!isVirtual}
            axis="x"
            bounds={{ left: RESIZE_HANDLE_WIDTH }}
            position={{
              x: this.getColumnWidth({ index: columnIndex }),
              y: 0,
            }}
            onStart={e => {
              e.stopPropagation();
              this.setState({ dragColIndex: columnIndex });
            }}
            onStop={(e, { x }) => {
              // prevent onVisualizationClick from being fired
              e.stopPropagation();
              this.onColumnResize(columnIndex, x);
              this.setState({ dragColIndex: null });
            }}
          >
            <ResizeHandle
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
        </HeaderCell>
      </Draggable>
    );
  };

  getDisplayColumnWidth = ({ index: displayIndex }) => {
    if (this.state.showDetailShortcut && displayIndex === 0) {
      return SIDEBAR_WIDTH;
    }

    // if the detail shortcut is visible, we've added a column of empty cells and need to shift
    // the display index to get the data index
    const dataIndex = this.state.showDetailShortcut
      ? displayIndex - 1
      : displayIndex;

    return this.getColumnWidth({ index: dataIndex });
  };

  _getColumnFullWidth = index => {
    const { settings } = this.props;
    const { columnWidths } = this.state;
    const columnWidthsSetting = settings["table.column_widths"] || [];

    const explicitWidth = columnWidthsSetting[index];
    const calculatedWidth = columnWidths[index] || MIN_COLUMN_WIDTH;

    return explicitWidth || calculatedWidth;
  };

  handleExpandColumn = index =>
    this.setState(
      prevState => {
        const columnIsExpanded = prevState.columnIsExpanded.slice();
        columnIsExpanded[index] = true;
        return { columnIsExpanded };
      },
      () => this.recomputeGridSize(),
    );

  isColumnWidthTruncated = index => {
    const { columnIsExpanded } = this.state;

    return (
      !columnIsExpanded[index] &&
      this._getColumnFullWidth(index) > TRUNCATE_WIDTH
    );
  };

  getColumnWidth = ({ index }) => {
    const { columnIsExpanded } = this.state;
    const fullWidth = this._getColumnFullWidth(index);

    return columnIsExpanded[index]
      ? fullWidth
      : Math.min(fullWidth, TRUNCATE_WIDTH);
  };

  handleHoverRow = (event, rowIndex) => {
    const hoverDetailEl = this.detailShortcutRef.current;

    if (!hoverDetailEl) {
      return;
    }

    const scrollOffset = ReactDOM.findDOMNode(this.grid)?.scrollTop || 0;

    // infer row index from mouse position when we hover the gutter column
    if (event?.currentTarget?.id === "gutter-column") {
      const gutterTop = event.currentTarget?.getBoundingClientRect()?.top;
      const fromTop = event.clientY - gutterTop;

      const newIndex = Math.floor((fromTop + scrollOffset) / ROW_HEIGHT);

      if (newIndex >= this.props.data.rows.length) {
        return;
      }
      hoverDetailEl.classList.add("show");
      hoverDetailEl.style.top = `${newIndex * ROW_HEIGHT - scrollOffset}px`;
      hoverDetailEl.dataset.showDetailRowindex = newIndex;
      hoverDetailEl.onclick = this.pkClick(newIndex);
      return;
    }

    const targetOffset = event?.currentTarget?.offsetTop;
    hoverDetailEl.classList.add("show");
    hoverDetailEl.style.top = `${targetOffset - scrollOffset}px`;
    hoverDetailEl.dataset.showDetailRowindex = rowIndex;
    hoverDetailEl.onclick = this.pkClick(rowIndex);
  };

  handleLeaveRow = () => {
    this.detailShortcutRef.current.classList.remove("show");
  };

  handleOnMouseEnter = () => {
    // prevent touchpad gestures from navigating forward/back if you're expecting to just scroll the table
    // https://stackoverflow.com/a/50846937
    this._previousOverscrollBehaviorX = document.body.style.overscrollBehaviorX;
    document.body.style.overscrollBehaviorX = "none";
  };
  handleOnMouseLeave = () => {
    document.body.style.overscrollBehaviorX = this._previousOverscrollBehaviorX;
  };

  render() {
    const {
      width,
      height,
      data: { cols, rows },
      className,
      scrollToColumn,
    } = this.props;

    if (!width || !height) {
      return <div className={className} />;
    }

    const headerHeight = this.props.tableHeaderHeight || HEADER_HEIGHT;
    const gutterColumn = this.state.showDetailShortcut ? 1 : 0;

    return (
      <ScrollSync>
        {({ onScroll, scrollLeft, scrollTop }) => {
          // Grid's doc says scrollToColumn takes precedence over scrollLeft
          // (https://github.com/bvaughn/react-virtualized/blob/master/docs/Grid.md#prop-types)
          // For some reason, for TableInteractive's main grid scrollLeft appears to be more prior
          const mainGridProps = {};
          if (scrollToColumn >= 0) {
            mainGridProps.scrollToColumn = scrollToColumn;
          } else {
            mainGridProps.scrollLeft = scrollLeft;
          }
          return (
            <div
              className={cx(className, "TableInteractive relative", {
                "TableInteractive--pivot": this.props.isPivoted,
                "TableInteractive--ready": this.state.contentWidths,
                // no hover if we're dragging a column
                "TableInteractive--noHover": this.state.dragColIndex != null,
              })}
              onMouseEnter={this.handleOnMouseEnter}
              onMouseLeave={this.handleOnMouseLeave}
              data-testid="TableInteractive-root"
            >
              <canvas
                className="spread"
                style={{ pointerEvents: "none", zIndex: 999 }}
                width={width}
                height={height}
              />
              {!!gutterColumn && (
                <>
                  <div
                    className="TableInteractive-header TableInteractive--noHover"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: SIDEBAR_WIDTH,
                      height: headerHeight,
                      zIndex: 4,
                    }}
                  />
                  <div
                    id="gutter-column"
                    className="TableInteractive-gutter"
                    style={{
                      position: "absolute",
                      top: headerHeight,
                      left: 0,
                      height: height - headerHeight - getScrollBarSize(),
                      width: SIDEBAR_WIDTH,
                      zIndex: 3,
                    }}
                    onMouseMove={this.handleHoverRow}
                    onMouseLeave={this.handleLeaveRow}
                  >
                    <DetailShortcut ref={this.detailShortcutRef} />
                  </div>
                </>
              )}
              <Grid
                ref={ref => (this.header = ref)}
                style={{
                  top: 0,
                  left: 0,
                  right: 0,
                  height: headerHeight,
                  position: "absolute",
                  overflow: "hidden",
                  paddingRight: getScrollBarSize(),
                }}
                className="TableInteractive-header scroll-hide-all"
                width={width || 0}
                height={headerHeight}
                rowCount={1}
                rowHeight={headerHeight}
                columnCount={cols.length + gutterColumn}
                columnWidth={this.getDisplayColumnWidth}
                cellRenderer={props =>
                  gutterColumn && props.columnIndex === 0
                    ? () => null // we need a phantom cell to properly offset columns
                    : this.tableHeaderRenderer({
                        ...props,
                        columnIndex: props.columnIndex - gutterColumn,
                      })
                }
                onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
                scrollLeft={scrollLeft}
                tabIndex={null}
                scrollToColumn={scrollToColumn}
              />
              <Grid
                id="main-data-grid"
                ref={ref => (this.grid = ref)}
                style={{
                  top: headerHeight,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  position: "absolute",
                }}
                width={width}
                height={height - headerHeight}
                columnCount={cols.length + gutterColumn}
                columnWidth={this.getDisplayColumnWidth}
                rowCount={rows.length}
                rowHeight={ROW_HEIGHT}
                cellRenderer={props =>
                  gutterColumn && props.columnIndex === 0
                    ? () => null // we need a phantom cell to properly offset columns
                    : this.cellRenderer({
                        ...props,
                        columnIndex: props.columnIndex - gutterColumn,
                      })
                }
                scrollTop={scrollTop}
                onScroll={({ scrollLeft, scrollTop }) => {
                  this.props.onActionDismissal();
                  return onScroll({ scrollLeft, scrollTop });
                }}
                {...mainGridProps}
                tabIndex={null}
                overscanRowCount={20}
              />
            </div>
          );
        }}
      </ScrollSync>
    );
  }

  _benchmark() {
    const grid = ReactDOM.findDOMNode(this.grid);
    const height = grid.scrollHeight;
    let top = 0;
    let start = Date.now();
    // console.profile();
    function next() {
      grid.scrollTop = top;

      setTimeout(() => {
        const end = Date.now();
        // eslint-disable-next-line no-console
        console.log(end - start);
        start = end;

        top += height / 10;
        if (top < height - height / 10) {
          next();
        } else {
          // console.profileEnd();
        }
      }, 40);
    }
    next();
  }
}

export default _.compose(
  ExplicitSize({
    refreshMode: props => (props.isDashboard ? "debounce" : "throttle"),
  }),
  connect(mapStateToProps, mapDispatchToProps),
  memoizeClass(
    "_getCellClickedObjectCached",
    "_visualizationIsClickableCached",
    "getCellBackgroundColor",
    "getCellFormattedValue",
    "getDimension",
  ),
)(TableInteractive);

const DetailShortcut = React.forwardRef((_props, ref) => (
  <div
    id="detail-shortcut"
    className="TableInteractive-cellWrapper cursor-pointer"
    ref={ref}
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      height: ROW_HEIGHT,
      width: SIDEBAR_WIDTH,
      zIndex: 3,
    }}
  >
    <Tooltip tooltip={t`View Details`}>
      <Button
        iconOnly
        iconSize={10}
        icon="expand"
        className="TableInteractive-detailButton"
      />
    </Tooltip>
  </div>
));

DetailShortcut.displayName = "DetailShortcut";
