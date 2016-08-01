import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import { Table, Column } from "fixed-data-table";

import Icon from "metabase/components/Icon.jsx";
import Popover from "metabase/components/Popover.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";
import { formatValue, capitalize } from "metabase/lib/formatting";

import _ from "underscore";
import cx from "classnames";

const QUICK_FILTERS = [
    { name: "<", value: "<" },
    { name: "=", value: "=" },
    { name: "≠", value: "!=" },
    { name: ">", value: ">" }
];

export default class TableInteractive extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            width: 0,
            height: 0,
            popover: null,
            columnWidths: [],
            contentWidths: null
        };

        _.bindAll(this, "onClosePopover", "rowGetter", "cellRenderer", "columnResized");

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

    componentDidMount() {
        this.calculateSizing(this.state);
    }

    shouldComponentUpdate(nextProps, nextState) {
        // this is required because we don't pass in the containing element size as a property :-/
        // if size changes don't update yet because state will change in a moment
        this.calculateSizing(nextState);

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
            let tableElement = ReactDOM.findDOMNode(this.refs.table);
            let contentWidths = [];
            let rowElements = tableElement.querySelectorAll(".fixedDataTableRowLayout_rowWrapper");
            for (var rowIndex = 0; rowIndex < rowElements.length; rowIndex++) {
                let cellElements = rowElements[rowIndex].querySelectorAll(".public_fixedDataTableCell_cellContent");
                for (var cellIndex = 0; cellIndex < cellElements.length; cellIndex++) {
                    contentWidths[cellIndex] = Math.max(contentWidths[cellIndex] || 0, cellElements[cellIndex].offsetWidth);
                }
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
        this.setState({ columnWidths });
    }

    calculateSizing(prevState, force) {
        var element = ReactDOM.findDOMNode(this);

        // account for padding of our parent
        var style = window.getComputedStyle(element.parentElement, null);
        var paddingTop = Math.ceil(parseFloat(style.getPropertyValue("padding-top")));
        var paddingLeft = Math.ceil(parseFloat(style.getPropertyValue("padding-left")));
        var paddingRight = Math.ceil(parseFloat(style.getPropertyValue("padding-right")));

        var width = element.parentElement.offsetWidth - paddingLeft - paddingRight;
        var height = element.parentElement.offsetHeight - paddingTop;

        if (width !== prevState.width || height !== prevState.height || force) {
            this.setState({ width, height });
        }
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

    rowGetter(rowIndex) {
        var row = {
            hasPopover: this.state.popover && this.state.popover.rowIndex === rowIndex || false
        };
        for (var i = 0; i < this.props.data.rows[rowIndex].length; i++) {
            row[i] = this.props.data.rows[rowIndex][i];
        }
        return row;
    }

    showPopover(rowIndex, cellDataKey) {
        this.setState({
            popover: {
                rowIndex: rowIndex,
                cellDataKey: cellDataKey
            }
        });
    }

    onClosePopover() {
        this.setState({ popover: null });
    }

    cellRenderer(cellData, cellDataKey, rowData, rowIndex, columnData, width) {
        cellData = cellData != null ? formatValue(cellData, { column: this.props.data.cols[cellDataKey], jsx: true }) : null;

        var key = 'cl'+rowIndex+'_'+cellDataKey;
        if (this.props.cellIsClickableFn(rowIndex, cellDataKey)) {
            return (
                <a key={key} className="link cellData" onClick={this.cellClicked.bind(this, rowIndex, cellDataKey)}>{cellData}</a>
            );
        } else {
            var popover = null;
            if (this.state.popover && this.state.popover.rowIndex === rowIndex && this.state.popover.cellDataKey === cellDataKey) {
                popover = (
                    <Popover
                        hasArrow={false}
                        tetherOptions={{
                            targetAttachment: "middle center",
                            attachment: "middle center"
                        }}
                        onClose={this.onClosePopover}
                    >
                        <div className="bg-white bordered shadowed p1">
                            <ul className="h1 flex align-center">
                                { QUICK_FILTERS.map(({ name, value }) =>
                                    <li key={value} className="p2 text-brand-hover" onClick={this.popoverFilterClicked.bind(this, rowIndex, cellDataKey, value)}>{name}</li>
                                )}
                            </ul>
                        </div>
                    </Popover>
                );
            }
            var imgRegex = new RegExp('^http.*\.jpg$', 'i');
            if (imgRegex.test(cellData)) {
                return (
                    <div key={key} onClick={this.showPopover.bind(this, rowIndex, cellDataKey)}>
                        <span className="cellData"><img style={{ height: 34 }} src={cellData} /></span>
                        {popover}
                    </div>
                );
            }

            return (
                <div key={key} onClick={this.showPopover.bind(this, rowIndex, cellDataKey)}>
                    <span className="cellData">{cellData}</span>
                    {popover}
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
        if(!this.props.data) {
            return false;
        }

        var tableColumns = this.props.data.cols.map((column, idx) => {
            var colVal = (column && column.display_name && String(column.display_name)) ||
                         (column && column.name && String(column.name)) || "";
            var colWidth = this.state.columnWidths[idx];

            if (!colWidth) {
                colWidth = 75;
            }

            return (
                <Column
                    key={'col_' + idx}
                    className="MB-DataTable-column"
                    width={colWidth}
                    isResizable={true}
                    headerRenderer={this.tableHeaderRenderer.bind(this, idx)}
                    cellRenderer={this.cellRenderer}
                    dataKey={idx}
                    label={colVal}>
                </Column>
            );
        });

        return (
            <span className={cx('MB-DataTable', { 'MB-DataTable--pivot': this.props.isPivoted, 'MB-DataTable--ready': this.state.contentWidths })}>
                <Table
                    ref="table"
                    rowHeight={50}
                    rowGetter={this.rowGetter}
                    rowsCount={this.props.data.rows.length}
                    width={this.state.width}
                    height={this.state.height}
                    headerHeight={50}
                    isColumnResizing={this.isColumnResizing}
                    onColumnResizeEndCallback={this.columnResized}
                    allowCellsRecycling={true}
                >
                    {tableColumns}
                </Table>
            </span>
        );
    }
}
