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

        _.bindAll(this, "onClosePopover", "cellRenderer", "columnResized");
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
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        if (JSON.stringify(this.props.data && this.props.data.cols) !== JSON.stringify(newProps.data && newProps.data.cols)) {
            this.setState({
                columnWidths: newProps.data.cols ? newProps.data.cols.map(col => 0) : [], // content cells don't wrap so this is fine
                contentWidths: null
            });
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        // compare props (excluding card) and state to determine if we should re-render
        // NOTE: this is essentially the same as React.addons.PureRenderMixin but
        // we currently need to recalculate the container size here.
        return (
            !_.isEqual({ ...this.props, card: null }, { ...nextProps, card: null }) ||
            !_.isEqual(this.state, nextState)
        );
    }

    componentDidUpdate() {
        const element = ReactDOM.findDOMNode(this);
        if (!this.state.contentWidths && element) {
            let contentWidths = [];
            let cellElements = element.querySelectorAll(".public_fixedDataTableCell_cellContent");
            for (let cellElement of cellElements) {
                let columnIndex = cellElement.parentElement.dataset.column;
                contentWidths[columnIndex] = Math.max(contentWidths[columnIndex] || 0, cellElement.offsetWidth);
            }
            this.setState({ contentWidths }, () => this.calculateColumnWidths(this.props.data.cols));
        }
    }

    calculateColumnWidths(cols) {
        let columnWidths = cols.map((col, index) => {
            if (this.state.contentWidths) {
                return Math.min(this.state.contentWidths[index] + 1, 300); // + 1 to make sure it doen't wrap?
            } else {
                return 300;
            }
        });
        this.setState({ columnWidths }, this.recomputeGridSize);
    }

    recomputeGridSize = () => {
        this.header.recomputeGridSize();
        this.grid.recomputeGridSize();
    }

    recomputeColumnSizes = _.debounce(() => {
        this.setState({ contentWidths: null })
    }, 100)

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

    onCellResize = () => {
        console.log("onCellResize")
        this.recomputeColumnSizes();
    }

    cellRenderer({ rowIndex, columnIndex }) {
        const { data: { cols, rows }} = this.props;
        const column = cols[columnIndex];
        const cellData = rows[rowIndex][columnIndex];

        if (this.props.cellIsClickableFn(rowIndex, columnIndex)) {
            return (
                <a
                    className="link cellData public_fixedDataTableCell_cellContent"
                    onClick={this.cellClicked.bind(this, rowIndex, columnIndex)}
                >
                    <Value value={cellData} column={column} onResize={this.onCellResize} />
                </a>
            );
        } else {
            const { popover } = this.state;
            const isFilterable = column.source !== "aggregation";
            return (
                <div
                    className={cx("public_fixedDataTableCell_cellContent", { "cursor-pointer": isFilterable })}
                    onClick={isFilterable && this.showPopover.bind(this, rowIndex, columnIndex)}
                >
                    <span className="cellData">
                        <Value value={cellData} column={column} onResize={this.onCellResize} />
                    </span>
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

    columnResized(columnIndex, width) {
        var tableColumnWidths = this.state.columnWidths.slice();
        tableColumnWidths[columnIndex] = Math.max(MIN_COLUMN_WIDTH, width);
        this.setState({
            columnWidths: tableColumnWidths
        }, this.recomputeGridSize);
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

        var headerClasses = cx('MB-DataTable-header cellData align-center public_fixedDataTableCell_cellContent', {
            'MB-DataTable-header--sorted': (this.props.sort && (this.props.sort[0][0] === column.id)),
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

    getColumnWidth = ({ index }) => this.state.columnWidths[index] || MIN_COLUMN_WIDTH;

    render() {
        const { width, height, data: { cols, rows }, className } = this.props;

        if (!width || !height) {
            return <div className={className} />;
        }

        return (
            <ScrollSync>
            {({ clientHeight, clientWidth, onScroll, scrollHeight, scrollLeft, scrollTop, scrollWidth }) =>
                <div className={cx(className, 'MB-DataTable relative fixedDataTableLayout_main public_fixedDataTable_main', { 'MB-DataTable--pivot': this.props.isPivoted, 'MB-DataTable--ready': this.state.contentWidths })}>
                    <Grid
                        ref={(ref) => this.header = ref}
                        style={{ top: 0, left: 0, right: 0, height: HEADER_HEIGHT, position: "absolute" }}
                        className="fixedDataTableRowLayout_main public_fixedDataTableRow_main fixedDataTableLayout_header public_fixedDataTable_header scroll-hide-all"
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
                                className="fixedDataTableCellLayout_main public_fixedDataTableCell_main"
                            >
                                <div className="fixedDataTableCellLayout_wrap3 public_fixedDataTableCell_wrap3" data-column={columnIndex}>
                                    {this.tableHeaderRenderer(columnIndex)}
                                </div>
                                <Draggable
                                    axis="x"
                                    bounds={{ left: RESIZE_HANDLE_WIDTH }}
                                    position={{ x: this.getColumnWidth({ index: columnIndex }), y: 0 }}
                                    onStart={() => {
                                        this.setState({ draggingIndex: columnIndex })
                                    }}
                                    onStop={(e, { x }) => {
                                        this.setState({ draggingIndex: null })
                                        this.columnResized(columnIndex, x)}
                                    }
                                >
                                    <div
                                        style={{ zIndex: 99, position: "absolute", width: RESIZE_HANDLE_WIDTH, top: 0, bottom: 0, left: -RESIZE_HANDLE_WIDTH - 1, cursor: "ew-resize" }}
                                        className={cx("bg-brand-hover", { "bg-brand": this.state.draggingIndex === columnIndex })}
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
                        className="fixedDataTableRowLayout_main public_fixedDataTableRow_main"
                        width={width}
                        height={height - HEADER_HEIGHT}
                        columnCount={cols.length}
                        columnWidth={this.getColumnWidth}
                        rowCount={rows.length}
                        rowHeight={ROW_HEIGHT}
                        cellRenderer={({ key, style, rowIndex, columnIndex }) =>
                            <div key={key} style={style} className="fixedDataTableCellLayout_main public_fixedDataTableCell_main">
                                <div className="fixedDataTableCellLayout_wrap3 public_fixedDataTableCell_wrap3" data-column={columnIndex}>
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
