/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { createRef, forwardRef, Component } from "react";
import ReactDOM from "react-dom";
import { connect } from "react-redux";
import { Grid, ScrollSync } from "react-virtualized";
import { t } from "ttag";
import _ from "underscore";

import { EMBEDDING_SDK_ROOT_ELEMENT_ID } from "embedding-sdk/config";
import ExplicitSize from "metabase/components/ExplicitSize";
import { QueryColumnInfoPopover } from "metabase/components/MetadataInfo/ColumnInfoPopover";
import Button from "metabase/core/components/Button";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import ExternalLink from "metabase/core/components/ExternalLink";
import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";
import { withMantineTheme } from "metabase/hoc/MantineTheme";
import { getScrollBarSize } from "metabase/lib/dom";
import { formatValue } from "metabase/lib/formatting";
import { setUIControls, zoomInRow } from "metabase/query_builder/actions";
import {
  getRowIndexToPKMap,
  getQueryBuilderMode,
  getUiControls,
  getIsShowingRawTable,
} from "metabase/query_builder/selectors";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { Box, Button as UIButton, Icon, DelayGroup } from "metabase/ui";
import {
  getTableCellClickedObject,
  getTableHeaderClickedObject,
  getTableClickedObjectRowData,
  isColumnRightAligned,
} from "metabase/visualizations/lib/table";
import { getColumnExtent } from "metabase/visualizations/lib/utils";
import * as Lib from "metabase-lib";
import { isAdHocModelQuestion } from "metabase-lib/v1/metadata/utils/models";
import { isID, isPK, isFK } from "metabase-lib/v1/types/utils/isa";
import { memoizeClass } from "metabase-lib/v1/utils";

import MiniBar from "../MiniBar";

import TableS from "./TableInteractive.module.css";
import {
  TableDraggable,
  ExpandButton,
  ResizeHandle,
  TableInteractiveRoot,
} from "./TableInteractive.styled";
import { getCellDataTheme } from "./table-theme-utils";

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
  rowIndexToPkMap: getRowIndexToPKMap(state),
  isEmbeddingSdk: getIsEmbeddingSdk(state),
  scrollToLastColumn: getUiControls(state).scrollToLastColumn,
  isRawTable: getIsShowingRawTable(state),
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
    this.detailShortcutRef = createRef();

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
    renderTableHeaderWrapper: children => {
      return (
        <Box className={TableS.cellData} data-testid="cell-data" c="brand">
          {children}
        </Box>
      );
    },
  };

  renderTableCellWrapper(children, { isIDColumn } = {}) {
    const { theme } = this.props;

    const hasChildren = children != null && children !== "";
    const cellTheme = getCellDataTheme({ theme, isIDColumn });

    return (
      <Box
        className={cx({
          [TableS.cellData]: hasChildren,
        })}
        data-testid={hasChildren ? "cell-data" : undefined}
        c={cellTheme.color}
        bg={cellTheme.background}
        style={{ border: cellTheme.border }}
      >
        {children}
      </Box>
    );
  }

  UNSAFE_componentWillMount() {
    // for measuring cells:
    this._div = document.createElement("div");
    this._div.className = cx(TableS.TableInteractive, "test-TableInteractive");
    this._div.style.display = "inline-block";
    this._div.style.position = "absolute";
    this._div.style.visibility = "hidden";
    this._div.style.zIndex = "-1";

    if (this.props.isEmbeddingSdk) {
      const rootElement = document.getElementById(
        EMBEDDING_SDK_ROOT_ELEMENT_ID,
      );

      if (rootElement) {
        rootElement.appendChild(this._div);
      } else {
        console.warn(
          // eslint-disable-next-line no-literal-metabase-strings -- not UI string
          "Failed to find Embedding SDK provider component. Have you forgot to add MetabaseProvider?",
        );
      }
    } else {
      document.body.appendChild(this._div);
    }

    this._measure();
    this._findIDColumn(this.props.data, this.props.isPivoted);
    this._showDetailShortcut(this.props.data, this.props.isPivoted);
  }

  componentWillUnmount() {
    if (this._div && this._div.parentNode) {
      this._div.parentNode.removeChild(this._div);
    }
    document.removeEventListener("keydown", this.onKeyDown);
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    const { question, data } = this.props;
    const { question: nextQuestion, data: nextData } = newProps;

    const isDataChange =
      data && nextData && !_.isEqual(data.cols, nextData.cols);
    const isDatasetStatusChange =
      isAdHocModelQuestion(nextQuestion, question) ||
      isAdHocModelQuestion(question, nextQuestion);

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
      this._showDetailShortcut(this.props.data, this.props.isPivoted);
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

  _showDetailShortcut = (data, isPivoted) => {
    const hasAggregation = data.cols.some(
      column => column.source === "aggregation",
    );
    const isNotebookPreview = this.props.queryBuilderMode === "notebook";
    const isModelEditor = this.props.queryBuilderMode === "dataset";
    const newShowDetailState =
      !(isPivoted || hasAggregation || isNotebookPreview || isModelEditor) &&
      !this.props.isEmbeddingSdk;

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

    // Reset the scrollToLastColumn ui control for subsequent renders.
    //
    // We need to include width and height here to avoid unsetting the ui control
    // before the component content has a chance to render (see the guard clause in
    // the render method).
    if (
      this.props.scrollToLastColumn &&
      this.props.width &&
      this.props.height
    ) {
      this.props.dispatch(setUIControls({ scrollToLastColumn: false }));
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
      <EmotionCacheProvider>
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
        </div>
      </EmotionCacheProvider>,
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

    const enabledColumns = columns
      .map((c, index) => ({ ...c, index }))
      .filter(c => c.enabled);

    const adjustedColumnIndex = enabledColumns[columnIndex].index;
    const adjustedNewColumnIndex = enabledColumns[newColumnIndex].index;

    columns.splice(
      adjustedNewColumnIndex,
      0,
      columns.splice(adjustedColumnIndex, 1)[0],
    );
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

  getHeaderClickedObject(data, columnIndex, isPivoted) {
    try {
      return getTableHeaderClickedObject(data, columnIndex, isPivoted);
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

  pkClick = rowIndex => () => {
    let objectId;

    if (this.state.IDColumn) {
      objectId = this.props.data.rows[rowIndex][this.state.IDColumnIndex];
    } else {
      objectId = this.props.rowIndexToPkMap[rowIndex] ?? rowIndex;
    }

    this.props.onZoomRow(objectId);
  };

  onKeyDown = event => {
    const detailEl = this.detailShortcutRef.current;
    const visibleDetailButton =
      !!detailEl &&
      Array.from(detailEl.classList).includes(CS.show) &&
      detailEl;
    const canViewRowDetail = !this.props.isPivoted && !!visibleDetailButton;

    if (event.key === "Enter" && canViewRowDetail) {
      const hoveredRowIndex = Number(detailEl.dataset.showDetailRowindex);
      this.pkClick(hoveredRowIndex)(event);
    }
  };

  cellRenderer = ({ key, style, rowIndex, columnIndex, isScrolling }) => {
    const { data, settings, theme } = this.props;
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
    const isClickable = !isLink && !isScrolling;

    const isIDColumn = value != null && isID(column);

    // Theme options from embedding SDK.
    const tableTheme = theme?.other?.table;

    const backgroundColor =
      this.getCellBackgroundColor(settings, value, rowIndex, column.name) ||
      tableTheme?.cell?.backgroundColor;

    const isCollapsed = this.isColumnWidthTruncated(columnIndex);

    const handleClick = e => {
      if (!isClickable || !this.visualizationIsClickable(clicked)) {
        return;
      }
      this.onVisualizationClick(clicked, e.currentTarget);
    };

    const handleKeyUp = e => {
      if (!isClickable || !this.visualizationIsClickable(clicked)) {
        return;
      }
      if (e.key === "Enter") {
        this.onVisualizationClick(clicked, e.currentTarget);
      }
    };

    return (
      <Box
        bg={backgroundColor}
        key={key}
        role="gridcell"
        style={{
          ...style,
          // use computed left if dragging
          left: this.getColumnLeft(style, columnIndex),
          // add a transition while dragging column
          transition: dragColIndex != null ? "left 200ms" : null,
        }}
        className={cx(
          TableS.TableInteractiveCellWrapper,
          "test-TableInteractive-cellWrapper",
          CS.textDark,
          CS.hoverParent,
          CS.hoverVisibility,
          {
            [TableS.TableInteractiveCellWrapperFirstColumn]: columnIndex === 0,
            "test-TableInteractive-cellWrapper--firstColumn": columnIndex === 0,
            [TableS.padLeft]: columnIndex === 0 && !showDetailShortcut,
            "test-TableInteractive-cellWrapper--lastColumn":
              columnIndex === cols.length - 1,
            "test-TableInteractive-emptyCell": value == null,
            [CS.cursorPointer]: isClickable,
            [CS.justifyEnd]: isColumnRightAligned(column),
            [TableS.TableID]: isIDColumn,
            "test-Table-ID": isIDColumn,
            "test-Table-FK": value != null && isFK(column),
            link: isClickable && isID(column),
          },
        )}
        onClick={handleClick}
        onKeyUp={handleKeyUp}
        onMouseEnter={
          showDetailShortcut ? e => this.handleHoverRow(e, rowIndex) : undefined
        }
        onMouseLeave={
          showDetailShortcut ? e => this.handleLeaveRow() : undefined
        }
        tabIndex="0"
      >
        {this.renderTableCellWrapper(cellData, { isIDColumn })}

        {isCollapsed && (
          <ExpandButton
            data-testid="expand-column"
            className={CS.hoverChild}
            small
            borderless
            iconSize={10}
            icon="ellipsis"
            onlyIcon
            onClick={e => this.handleExpandButtonClick(e, columnIndex)}
          />
        )}
      </Box>
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
      isPivoted,
      hasMetadataPopovers,
      getColumnTitle,
      getColumnSortDirection,
      renderTableHeaderWrapper,
      question,
      mode,
    } = this.props;

    const { dragColIndex, showDetailShortcut } = this.state;
    const { cols } = data;
    const column = cols[columnIndex];

    const query = question?.query();
    const stageIndex = -1;

    const columnTitle = getColumnTitle(columnIndex);
    const clicked = this.getHeaderClickedObject(data, columnIndex, isPivoted);
    const isDraggable = !isPivoted;
    const isDragging = dragColIndex === columnIndex;
    const isClickable = Boolean(
      mode?.hasDrills &&
        query &&
        Lib.queryDisplayInfo(query, stageIndex).isEditable,
    );
    const isSortable = isClickable && column.source && !isPivoted;
    const isRightAligned = isColumnRightAligned(column);

    const sortDirection = getColumnSortDirection(columnIndex);
    const isSorted = sortDirection != null;
    const isAscending = sortDirection === "asc";

    const columnInfoPopoverTestId = "field-info-popover";

    return (
      <TableDraggable
        enableUserSelectHack={false}
        enableCustomUserSelectHack={!isVirtual}
        /* needs to be index+name+counter so Draggable resets after each drag */
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
        <Box
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
            TableS.TableInteractiveCellWrapper,
            "test-TableInteractive-cellWrapper",
            TableS.TableInteractiveHeaderCellData,
            "test-TableInteractive-headerCellData",
            {
              [TableS.TableInteractiveCellWrapperFirstColumn]:
                columnIndex === 0,
              "test-TableInteractive-cellWrapper--firstColumn":
                columnIndex === 0,
              [TableS.padLeft]: columnIndex === 0 && !showDetailShortcut,
              "test-TableInteractive-cellWrapper--lastColumn":
                columnIndex === cols.length - 1,
              [TableS.TableInteractiveHeaderCellDataSorted]: isSorted,
              "test-TableInteractive-headerCellData--sorted": isSorted,
              [CS.z1]: isDragging,
              [CS.cursorPointer]: isClickable,
              [CS.justifyEnd]: isRightAligned,
            },
          )}
          role="columnheader"
          aria-label={columnTitle}
          data-testid={isVirtual ? undefined : "header-cell"}
          onClick={
            // only use the onClick if not draggable since it's also handled in Draggable's onStop
            isClickable && !isDraggable
              ? e => {
                  this.onVisualizationClick(clicked, e.currentTarget);
                }
              : undefined
          }
        >
          <QueryColumnInfoPopover
            position="bottom-start"
            query={query}
            stageIndex={-1}
            column={query && Lib.fromLegacyColumn(query, stageIndex, column)}
            timezone={data.results_timezone}
            disabled={this.props.clicked != null || !hasMetadataPopovers}
            showFingerprintInfo
          >
            {renderTableHeaderWrapper(
              <Ellipsified tooltip={columnTitle}>
                {isSortable && isRightAligned && (
                  <Icon
                    className={cx("Icon", CS.mr1)}
                    name={isAscending ? "chevronup" : "chevrondown"}
                    size={10}
                    data-testid={columnInfoPopoverTestId}
                  />
                )}
                {columnTitle}
                {isSortable && !isRightAligned && (
                  <Icon
                    className={cx("Icon", CS.ml1)}
                    name={isAscending ? "chevronup" : "chevrondown"}
                    size={10}
                    data-testid={columnInfoPopoverTestId}
                  />
                )}
              </Ellipsified>,
              column,
              columnIndex,
            )}
          </QueryColumnInfoPopover>
          <TableDraggable
            enableUserSelectHack={false}
            enableCustomUserSelectHack={!isVirtual}
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
          </TableDraggable>
        </Box>
      </TableDraggable>
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
      hoverDetailEl.classList.add(CS.show);
      hoverDetailEl.style.top = `${newIndex * ROW_HEIGHT - scrollOffset}px`;
      hoverDetailEl.dataset.showDetailRowindex = newIndex;
      hoverDetailEl.onclick = this.pkClick(newIndex);
      return;
    }

    const targetOffset = event?.currentTarget?.offsetTop;
    hoverDetailEl.classList.add(CS.show);
    hoverDetailEl.style.top = `${targetOffset - scrollOffset}px`;
    hoverDetailEl.dataset.showDetailRowindex = rowIndex;
    hoverDetailEl.onclick = this.pkClick(rowIndex);
  };

  handleLeaveRow = () => {
    this.detailShortcutRef.current.classList.remove(CS.show);
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

  _shouldShowShorcutButton() {
    const { question, mode, isRawTable } = this.props;

    if (!question || !mode?.clickActions) {
      return false;
    }

    for (const action of mode.clickActions) {
      const res = action({
        question,
        clicked: {
          columnShortcuts: true,
          extraData: {
            isRawTable,
          },
        },
      });
      if (res?.length > 0) {
        return true;
      }
    }

    return false;
  }

  render() {
    const {
      width,
      height,
      data: { cols, rows },
      className,
      scrollToColumn,
      scrollToLastColumn,
      theme,
    } = this.props;

    if (!width || !height) {
      return <div className={className} />;
    }

    const headerHeight = this.props.tableHeaderHeight || HEADER_HEIGHT;
    const gutterColumn = this.state.showDetailShortcut ? 1 : 0;
    const shortcutColumn = this._shouldShowShorcutButton();

    const tableTheme = theme?.other?.table;
    const backgroundColor = tableTheme?.cell?.backgroundColor;

    const totalWidth =
      this.state.columnWidths?.reduce(
        (sum, _c, index) => sum + this.getColumnWidth({ index }),
        0,
      ) + (gutterColumn ? SIDEBAR_WIDTH : 0);

    return (
      <DelayGroup>
        <ScrollSync>
          {({ onScroll, scrollLeft, scrollTop }) => {
            // Grid's doc says scrollToColumn takes precedence over scrollLeft
            // (https://github.com/bvaughn/react-virtualized/blob/master/docs/Grid.md#prop-types)
            // For some reason, for TableInteractive's main grid scrollLeft appears to be more prior
            const mainGridProps = {};

            if (scrollToLastColumn) {
              mainGridProps.scrollToColumn = cols.length + 2;
            } else if (scrollToColumn >= 0) {
              mainGridProps.scrollToColumn = scrollToColumn;
            } else {
              mainGridProps.scrollLeft = scrollLeft;
            }
            return (
              <TableInteractiveRoot
                bg={backgroundColor}
                className={cx(
                  className,
                  TableS.TableInteractive,
                  "test-TableInteractive",
                  CS.relative,
                  {
                    [TableS.TableInteractivePivot]: this.props.isPivoted,
                  },
                )}
                onMouseEnter={this.handleOnMouseEnter}
                onMouseLeave={this.handleOnMouseLeave}
                data-testid="TableInteractive-root"
              >
                <canvas
                  className={CS.spread}
                  style={{ pointerEvents: "none", zIndex: 999 }}
                  width={width}
                  height={height}
                />
                {!!gutterColumn && (
                  <>
                    <div
                      className={TableS.TableInteractiveHeader}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: SIDEBAR_WIDTH,
                        height: headerHeight,
                        zIndex: 4,
                      }}
                    />
                    <Box
                      id="gutter-column"
                      bg={backgroundColor}
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
                    </Box>
                  </>
                )}
                {shortcutColumn && (
                  <ColumnShortcut
                    height={headerHeight - 1}
                    pageWidth={width}
                    totalWidth={totalWidth}
                    onClick={evt => {
                      this.onVisualizationClick(
                        { columnShortcuts: true },
                        evt.target,
                      );
                    }}
                  />
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
                  className={cx(
                    TableS.TableInteractiveHeader,
                    CS.scrollHideAll,
                  )}
                  width={width || 0}
                  height={headerHeight}
                  rowCount={1}
                  rowHeight={headerHeight}
                  columnCount={cols.length + gutterColumn + shortcutColumn}
                  columnWidth={this.getDisplayColumnWidth}
                  cellRenderer={props => {
                    if (props.columnIndex === 0 && gutterColumn) {
                      // we need a phantom cell to properly offset gutter columns
                      return null;
                    }

                    if (props.columnIndex === cols.length + gutterColumn) {
                      // we need a phantom cell to properly offset the shortcut column
                      return null;
                    }

                    return this.tableHeaderRenderer({
                      ...props,
                      columnIndex: props.columnIndex - gutterColumn,
                    });
                  }}
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
                  columnCount={cols.length + gutterColumn + shortcutColumn}
                  columnWidth={this.getDisplayColumnWidth}
                  rowCount={rows.length}
                  rowHeight={ROW_HEIGHT}
                  cellRenderer={props => {
                    if (props.columnIndex === 0 && gutterColumn) {
                      // we need a phantom cell to properly offset gutter columns
                      return null;
                    }

                    if (props.columnIndex === cols.length + gutterColumn) {
                      // we need a phantom cell to properly offset the shortcut column
                      return null;
                    }

                    return this.cellRenderer({
                      ...props,
                      columnIndex: props.columnIndex - gutterColumn,
                    });
                  }}
                  scrollTop={scrollTop}
                  onScroll={({ scrollLeft, scrollTop }) => {
                    this.props.onActionDismissal();
                    return onScroll({ scrollLeft, scrollTop });
                  }}
                  {...mainGridProps}
                  tabIndex={null}
                  overscanRowCount={20}
                />
              </TableInteractiveRoot>
            );
          }}
        </ScrollSync>
      </DelayGroup>
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
  withMantineTheme,
  ExplicitSize({
    refreshMode: props => (props.isDashboard ? "debounce" : "throttle"),
  }),
  connect(mapStateToProps, mapDispatchToProps),
  memoizeClass(
    "_getCellClickedObjectCached",
    "_visualizationIsClickableCached",
    "getCellBackgroundColor",
    "getCellFormattedValue",
    "getHeaderClickedObject",
  ),
)(TableInteractive);

const DetailShortcut = forwardRef((_props, ref) => (
  <div
    className={cx(
      TableS.TableInteractiveCellWrapper,
      "test-TableInteractive-cellWrapper",
      CS.cursorPointer,
    )}
    ref={ref}
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      height: ROW_HEIGHT,
      width: SIDEBAR_WIDTH,
      zIndex: 3,
    }}
    data-testid="detail-shortcut"
  >
    <Tooltip tooltip={t`View Details`}>
      <Button
        iconOnly
        iconSize={10}
        icon="expand"
        className={CS.TableInteractiveDetailButton}
      />
    </Tooltip>
  </div>
));

DetailShortcut.displayName = "DetailShortcut";

const COLUMN_SHORTCUT_PADDING = 4;

function ColumnShortcut({ height, pageWidth, totalWidth, onClick }) {
  if (!totalWidth) {
    return null;
  }

  const isOverflowing = totalWidth > pageWidth;
  const width = HEADER_HEIGHT + (isOverflowing ? COLUMN_SHORTCUT_PADDING : 0);

  return (
    <div
      className={cx(
        TableS.shortcutsWrapper,
        isOverflowing && TableS.isOverflowing,
      )}
      style={{
        height,
        width,
        left: isOverflowing ? undefined : totalWidth,
        right: isOverflowing ? 0 : undefined,
      }}
    >
      <UIButton
        variant="outline"
        compact
        leftIcon={<Icon name="add" />}
        title={t`Add column`}
        aria-label={t`Add column`}
        onClick={onClick}
      />
    </div>
  );
}
