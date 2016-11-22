import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import Icon from "metabase/components/Icon.jsx";

import Value from "metabase/components/Value.jsx";
import QuickFilterPopover from "metabase/query_builder/components/QuickFilterPopover.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";
import { capitalize } from "metabase/lib/formatting";

import _ from "underscore";
import cx from "classnames";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import { Grid, ScrollSync } from "react-virtualized";

import Draggable from "react-draggable";

const HEADER_HEIGHT = 50;
const ROW_HEIGHT = 35;
const MIN_COLUMN_WIDTH = ROW_HEIGHT;
const RESIZE_HANDLE_WIDTH = 5;

@ExplicitSize
export default class TableInteractive extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            popover: null,
            columnWidths: [],
            contentWidths: null
        };
        this.columnHasResized = {};

        _.bindAll(this, "onClosePopover", "cellRenderer");
    }

    static propTypes = {
        data: PropTypes.object.isRequired,
        isPivoted: PropTypes.bool.isRequired,
        sort: PropTypes.array,
        setSortFn: PropTypes.func,
        cellIsClickableFn: PropTypes.func.isRequired,
        cellClickedFn: PropTypes.func.isRequired
    };

    static defaultProps = {
        isPivoted: false,
        cellIsClickableFn: () => false,
        cellClickedFn: () => {}
    };

    componentWillMount() {
        // for measuring cells:
        this._div = document.createElement("div");
        this._div.className = "MB-DataTable";
        this._div.style.display = "inline-block"
        this._div.style.position = "absolute"
        this._div.style.visibility = "hidden"
        this._div.style.zIndex = -1
        document.body.appendChild(this._div);

        this._measure();
    }

    componentWillUnmount() {
        this._div.parent.removeChild(this._div);
    }

    componentWillReceiveProps(newProps) {
        if (JSON.stringify(this.props.data && this.props.data.cols) !== JSON.stringify(newProps.data && newProps.data.cols)) {
            this.resetColumnWidths();
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        const PROP_KEYS = ["width", "height", "settings", "data"];
        // compare specific props and state to determine if we should re-render
        return (
            !_.isEqual(_.pick(this.props, PROP_KEYS), _.pick(nextProps, PROP_KEYS)) ||
            !_.isEqual(this.state, nextState)
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
            contentWidths: null
        });
        this.columnHasResized = {};
        this.props.onUpdateVisualizationSettings({ "table.column_widths": [] });
    }

    _measure() {
        const { data: { cols } } = this.props;

        let contentWidths = cols.map((col, index) =>
            this._measureColumn(index)
        );

        let columnWidths = cols.map((col, index) => {
            if (this.columnNeedsResize) {
                if (this.columnNeedsResize[index] && !this.columnHasResized[index]) {
                    this.columnHasResized[index] = true;
                    return contentWidths[index] + 1; // + 1 to make sure it doen't wrap?
                } else if (this.state.columnWidths[index]) {
                    return this.state.columnWidths[index];
                }
            } else {
                return contentWidths[index] + 1;
            }
        });

        delete this.columnNeedsResize;

        this.setState({ contentWidths, columnWidths }, this.recomputeGridSize);
    }

    _measureColumn(columnIndex) {
        const { data: { rows } } = this.props;
        let width = MIN_COLUMN_WIDTH;

        // measure column header
        width = Math.max(width, this._measureCell(this.tableHeaderRenderer(columnIndex)));

        // measure up to 10 non-nil cells
        let remaining = 10;
        for (let rowIndex = 0; rowIndex < rows.length && remaining > 0; rowIndex++) {
            if (rows[rowIndex][columnIndex] != null) {
                const cellWidth = this._measureCell(this.cellRenderer({ rowIndex, columnIndex }));
                width = Math.max(width, cellWidth);
                remaining--;
            }
        }

        return width;
    }

    _measureCell(cell) {
        ReactDOM.unstable_renderSubtreeIntoContainer(this,
            <div className="MB-DataTable-cellContent">
                {cell}
            </div>
        , this._div);

        // 2px for border?
        const width = this._div.clientWidth + 2;

        ReactDOM.unmountComponentAtNode(this._div);

        return width;
    }

    recomputeGridSize = () => {
        if (this.header && this.grid) {
            this.header.recomputeGridSize();
            this.grid.recomputeGridSize();
        }
    }

    recomputeColumnSizes = _.debounce(() => {
        this.setState({ contentWidths: null })
    }, 100)

    onCellResize(columnIndex) {
        this.columnNeedsResize = this.columnNeedsResize || {}
        this.columnNeedsResize[columnIndex] = true;
        this.recomputeColumnSizes();
    }

    onColumnResize(columnIndex, width) {
        const { settings } = this.props;
        let columnWidthsSetting = settings["table.column_widths"] ? settings["table.column_widths"].slice() : [];
        columnWidthsSetting[columnIndex] = Math.max(MIN_COLUMN_WIDTH, width);
        this.props.onUpdateVisualizationSettings({ "table.column_widths": columnWidthsSetting });
        setTimeout(() => this.recomputeGridSize(), 1);
    }

    isSortable() {
        return (this.props.setSortFn !== undefined);
    }

    setSort(column) {
        // lets completely delegate this to someone else up the stack :)
        this.props.setSortFn(column);
        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Sort', 'table column');
    }

    cellClicked(rowIndex, columnIndex) {
        this.props.cellClickedFn(rowIndex, columnIndex);
    }

    popoverFilterClicked(rowIndex, columnIndex, operator) {
        this.props.cellClickedFn(rowIndex, columnIndex, operator);
        this.setState({ popover: null });
    }

    showPopover(rowIndex, columnIndex) {
        this.setState({
            popover: {
                rowIndex: rowIndex,
                columnIndex: columnIndex
            }
        });
    }

    onClosePopover() {
        this.setState({ popover: null });
    }

    cellRenderer({ rowIndex, columnIndex }) {
        const { data: { cols, rows }} = this.props;
        const column = cols[columnIndex];
        const cellData = rows[rowIndex][columnIndex];

        if (this.props.cellIsClickableFn(rowIndex, columnIndex)) {
            return (
                <a
                    className="link cellData"
                    onClick={this.cellClicked.bind(this, rowIndex, columnIndex)}
                >
                    <Value value={cellData} column={column} onResize={this.onCellResize.bind(this, columnIndex)} />
                </a>
            );
        } else {
            const { popover } = this.state;
            const isFilterable = column.source !== "aggregation";
            return (
                <div
                    className={cx("cellData", { "cursor-pointer": isFilterable })}
                    onClick={isFilterable && this.showPopover.bind(this, rowIndex, columnIndex)}
                >
                    <Value value={cellData} column={column} onResize={this.onCellResize.bind(this, columnIndex)} />
                    { popover && popover.rowIndex === rowIndex && popover.columnIndex === columnIndex &&
                        <QuickFilterPopover
                            column={cols[this.state.popover.columnIndex]}
                            onFilter={this.popoverFilterClicked.bind(this, rowIndex, columnIndex)}
                            onClose={this.onClosePopover}
                        />
                    }
                </div>
            );
        }
    }

    tableHeaderRenderer(columnIndex) {
        var column = this.props.data.cols[columnIndex],
            colVal = (column && column.display_name && String(column.display_name)) ||
                     (column && column.name && String(column.name)) || "";

        if (column.unit && column.unit !== "default") {
            colVal += ": " + capitalize(column.unit.replace(/-/g, " "))
        }

        if (!colVal && this.props.isPivoted && columnIndex !== 0) {
            colVal = "Unset";
        }

        var headerClasses = cx('MB-DataTable-headerCellData cellData align-center', {
            'MB-DataTable-headerCellData--sorted': (this.props.sort && (this.props.sort[0][0] === column.id)),
        });

        // set the initial state of the sorting indicator chevron
        var sortChevron = (<Icon name="chevrondown" size={8}></Icon>);

        if(this.props.sort && this.props.sort[0][1] === 'ascending') {
            sortChevron = (<Icon name="chevronup" size={8}></Icon>);
        }

        if (this.isSortable()) {
            return (
                <div key={columnIndex} className={headerClasses} onClick={this.setSort.bind(this, column)}>
                    <span>
                        {colVal}
                    </span>
                    <span className="ml1">
                        {sortChevron}
                    </span>
                </div>
            );
        } else {
            return (
                <span className={headerClasses}>
                    {colVal}
                </span>
            );
        }
    }

    getColumnWidth = ({ index }) => {
        const { settings } = this.props;
        const { columnWidths } = this.state;
        const columnWidthsSetting = settings["table.column_widths"] || [];
        return columnWidthsSetting[index] || columnWidths[index] || MIN_COLUMN_WIDTH;
    }

    render() {
        const { width, height, data: { cols, rows }, className } = this.props;

        if (!width || !height) {
            return <div className={className} />;
        }

        return (
            <ScrollSync>
            {({ clientHeight, clientWidth, onScroll, scrollHeight, scrollLeft, scrollTop, scrollWidth }) =>
                <div className={cx(className, 'MB-DataTable relative', { 'MB-DataTable--pivot': this.props.isPivoted, 'MB-DataTable--ready': this.state.contentWidths })}>
                    <Grid
                        ref={(ref) => this.header = ref}
                        style={{ top: 0, left: 0, right: 0, height: HEADER_HEIGHT, position: "absolute" }}
                        className=" MB-DataTable-header scroll-hide-all"
                        width={width || 0}
                        height={HEADER_HEIGHT}
                        columnCount={cols.length}
                        columnWidth={this.getColumnWidth}
                        rowCount={1}
                        rowHeight={HEADER_HEIGHT}
                        cellRenderer={({ key, style, rowIndex, columnIndex }) =>
                            <div
                                key={key}
                                style={{ ...style, overflow: "visible" /* ensure resize handle is visible */ }}
                                className="MB-DataTable-cellWrapper"
                            >
                                <div className="MB-DataTable-cellContent" data-column={columnIndex}>
                                    {this.tableHeaderRenderer(columnIndex)}
                                </div>
                                <Draggable
                                    axis="x"
                                    bounds={{ left: RESIZE_HANDLE_WIDTH }}
                                    position={{ x: this.getColumnWidth({ index: columnIndex }), y: 0 }}
                                    onStop={(e, { x }) => {
                                        this.onColumnResize(columnIndex, x)}
                                    }
                                >
                                    <div
                                        className="bg-brand-hover bg-brand-active"
                                        style={{ zIndex: 99, position: "absolute", width: RESIZE_HANDLE_WIDTH, top: 0, bottom: 0, left: -RESIZE_HANDLE_WIDTH - 1, cursor: "ew-resize" }}
                                    />
                                </Draggable>
                            </div>
                        }
                        onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
                        scrollLeft={scrollLeft}
                        tabIndex={null}
                    />
                    <Grid
                        ref={(ref) => this.grid = ref}
                        style={{ top: HEADER_HEIGHT, left: 0, right: 0, bottom: 0, position: "absolute" }}
                        className=""
                        width={width}
                        height={height - HEADER_HEIGHT}
                        columnCount={cols.length}
                        columnWidth={this.getColumnWidth}
                        rowCount={rows.length}
                        rowHeight={ROW_HEIGHT}
                        cellRenderer={({ key, style, rowIndex, columnIndex }) =>
                            <div key={key} style={style} className="MB-DataTable-cellWrapper">
                                <div className="MB-DataTable-cellContent" data-column={columnIndex}>
                                    {this.cellRenderer({ rowIndex, columnIndex })}
                                </div>
                            </div>
                        }
                        onScroll={({ scrollLeft }) => onScroll({ scrollLeft })}
                        scrollLeft={scrollLeft}
                        tabIndex={null}
                        overscanRowCount={10}
                    />
                </div>
            }
            </ScrollSync>
        );
    }
}
