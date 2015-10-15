import React, { Component, PropTypes } from "react";

import { Table, Column } from 'fixed-data-table';
import Icon from "metabase/components/Icon.jsx";
import Popover from "metabase/components/Popover.jsx";

import MetabaseAnalytics from '../lib/analytics';
import DataGrid from "metabase/lib/data_grid";
import { formatValue, capitalize } from "metabase/lib/formatting";

import _ from "underscore";
import cx from "classnames";

export default class QueryVisualizationTable extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            width: 0,
            height: 0,
            columnWidths: [],
            popover: null,
            data: null,
            rawData: null,
            contentWidths: null
        };

        _.bindAll(this, "onClosePopover", "rowGetter", "cellRenderer", "columnResized");

        this.isColumnResizing = false;
    }

    static propTypes = {
        data: PropTypes.object,
        sort: PropTypes.array,
        setSortFn: PropTypes.func,
        isCellClickableFn: PropTypes.func,
        cellClickedFn: PropTypes.func
    };

    static defaultProps = {
        maxRows: 2000,
        minColumnWidth: 75
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        if (newProps.data && newProps.data !== this.state.rawData) {
            let gridData = (newProps.pivot) ? DataGrid.pivot(newProps.data) : newProps.data;
            this.setState({
                data: gridData,
                rawData: this.props.data
            });
            if (JSON.stringify(this.state.data && this.state.data.cols) !== JSON.stringify(gridData.cols)) {
                this.setState({
                    columnWidths: gridData.cols.map(col => 0), // content cells don't wrap so this is fine
                    contentWidths: null
                });
            }
        }
    }

    componentDidMount() {
        this.calculateSizing(this.state);
    }

    shouldComponentUpdate(nextProps, nextState) {
        // this is required because we don't pass in the containing element size as a property :-/
        // if size changes don't update yet because state will change in a moment
        this.calculateSizing(nextState);

        // compare props and state to determine if we should re-render
        // NOTE: this is essentially the same as React.addons.PureRenderMixin but
        // we currently need to recalculate the container size here.
        return !_.isEqual(this.props, nextProps) || !_.isEqual(this.state, nextState);
    }

    componentDidUpdate() {
        if (!this.state.contentWidths) {
            let tableElement = React.findDOMNode(this.refs.table);
            let contentWidths = [];
            let rowElements = tableElement.querySelectorAll(".fixedDataTableRowLayout_rowWrapper");
            for (var rowIndex = 0; rowIndex < rowElements.length; rowIndex++) {
                let cellElements = rowElements[rowIndex].querySelectorAll(".public_fixedDataTableCell_cellContent");
                for (var cellIndex = 0; cellIndex < cellElements.length; cellIndex++) {
                    contentWidths[cellIndex] = Math.max(contentWidths[cellIndex] || 0, cellElements[cellIndex].offsetWidth);
                }
            }
            this.setState({ contentWidths }, () => this.calculateColumnWidths(this.state.data.cols));
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
        var element = React.findDOMNode(this);

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

    setSort(fieldId) {
        this.props.setSortFn(fieldId);

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
        for (var i = 0; i < this.state.data.rows[rowIndex].length; i++) {
            row[i] = this.state.data.rows[rowIndex][i];
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
        cellData = cellData != null ? formatValue(cellData, this.props.data.cols[cellDataKey]) : null;

        var key = 'cl'+rowIndex+'_'+cellDataKey;
        if (this.props.cellIsClickableFn(rowIndex, cellDataKey)) {
            return (
                <a key={key} className="link cellData" href="#" onClick={this.cellClicked.bind(this, rowIndex, cellDataKey)}>{cellData}</a>
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
                                { ["<", "=", "≠", ">"].map(operator =>
                                    <li key={operator} className="p2 text-brand-hover" onClick={this.popoverFilterClicked.bind(this, rowIndex, cellDataKey, operator)}>{operator}</li>
                                )}
                            </ul>
                        </div>
                    </Popover>
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
        var column = this.state.data.cols[columnIndex],
            colVal = (column && column.display_name && column.display_name.toString()) ||
                     (column && column.name && column.name.toString());

        if (column.unit) {
            colVal += ": " + capitalize(column.unit.replace(/-/g, " "))
        }

        if (!colVal && this.props.pivot && columnIndex !== 0) {
            colVal = "Unset";
        }

        var headerClasses = cx('MB-DataTable-header cellData align-center', {
            'MB-DataTable-header--sorted': (this.props.sort && (this.props.sort[0][0] === column.id)),
        });

        // set the initial state of the sorting indicator chevron
        var sortChevron = (<Icon name="chevrondown" width="8px" height="8px"></Icon>);

        if(this.props.sort && this.props.sort[0][1] === 'ascending') {
            sortChevron = (<Icon name="chevronup" width="8px" height="8px"></Icon>);
        }

        if (this.isSortable()) {
            // ICK.  this is hacky for dealing with aggregations.  need something better
            var fieldId = (column.id) ? column.id : "agg";

            return (
                <div key={columnIndex} className={headerClasses} onClick={this.setSort.bind(this, fieldId)}>
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
        if(!this.state.data) {
            return false;
        }

        var tableColumns = this.state.data.cols.map((column, idx) => {
            var colVal = (column !== null) ? column.name.toString() : null;
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
            <span className={cx('MB-DataTable', { 'MB-DataTable--pivot': this.props.pivot, 'MB-DataTable--ready': this.state.contentWidths })}>
                <Table
                    ref="table"
                    rowHeight={35}
                    rowGetter={this.rowGetter}
                    rowsCount={this.state.data.rows.length}
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
