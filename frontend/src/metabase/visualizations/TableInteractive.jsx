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
import { Grid } from "react-virtualized";

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

        this.isColumnResizing = false;
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
        if (!this.state.contentWidths) {
            let contentWidths = [];
            let cellElements = ReactDOM.findDOMNode(this).querySelectorAll(".public_fixedDataTableCell_cellContent");
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
        this.setState({ columnWidths }, () => this.refs.grid.recomputeGridSize());
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
                    className="link cellData public_fixedDataTableCell_cellContent"
                    onClick={this.cellClicked.bind(this, rowIndex, columnIndex)}
                >
                    <Value value={cellData} column={column} />
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
                        <Value value={cellData} column={column} />
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

    columnResized(width, idx) {
        var tableColumnWidths = this.state.columnWidths.slice();
        tableColumnWidths[idx] = width;
        this.setState({
            columnWidths: tableColumnWidths
        });
        this.isColumnResizing = false;
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

        var headerClasses = cx('MB-DataTable-header cellData align-center', {
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

    render() {
        const { width, height, data: { cols, rows }, className } = this.props;

        return (
            <div className={cx(className, 'MB-DataTable', { 'MB-DataTable--pivot': this.props.isPivoted, 'MB-DataTable--ready': this.state.contentWidths })}>
                <Grid
                    ref="grid"
                    className="fixedDataTableLayout_main public_fixedDataTable_main"
                    width={width || 0}
                    height={height || 0}
                    columnCount={cols.length}
                    columnWidth={({ index }) => this.state.columnWidths[index] || 75}
                    rowCount={rows.length}
                    rowHeight={35}
                    cellRenderer={({ key, style, rowIndex, columnIndex }) =>
                        <div key={key} style={style} className="fixedDataTableCellLayout_main public_fixedDataTableCell_main">
                            <div className="fixedDataTableCellLayout_wrap3 public_fixedDataTableCell_wrap3" data-column={columnIndex}>
                                {this.cellRenderer({ rowIndex, columnIndex })}
                            </div>
                        </div>
                    }
                />
            </div>
        );
    }
}
