'use strict';
/*global _*/

import MetabaseAnalytics from '../lib/analytics';

import FixedDataTable from 'fixed-data-table';
import Icon from './icon.react';
import Popover from './popover.react';

var cx = React.addons.classSet;
var Table = FixedDataTable.Table;
var Column = FixedDataTable.Column;

export default React.createClass({
    displayName: 'QueryVisualizationTable',
    propTypes: {
        data: React.PropTypes.object,
        sort: React.PropTypes.array,
        setSortFn: React.PropTypes.func,
        isCellClickableFn: React.PropTypes.func,
        cellClickedFn: React.PropTypes.func
    },

    // local variables
    isColumnResizing: false,

    // React lifecycle
    getDefaultProps: function() {
        return {
            maxRows: 2000,
            minColumnWidth: 75
        };
    },

    getInitialState: function() {
        return {
            width: 0,
            height: 0,
            columnWidths: [],
            colDefs: null,
            popover: null
        };
    },

    componentWillMount: function() {
        if (this.props.data) {
            this.setState({
                colDefs: JSON.stringify(this.props.data.cols)
            });
        }
    },

    componentWillReceiveProps: function(newProps) {
        // TODO: check if our data has changed and specifically if our columns list has changed
        if (JSON.stringify(newProps.data.cols) !== this.state.colDefs) {
            // if the columns have changed then reset any column widths we have setup
            this.setState({
                colDefs: JSON.stringify(this.props.data.cols),
                columnWidths: this.calculateColumnWidths(this.state.width, this.props.minColumnWidth, newProps.data.cols)
            });
        }
    },

    componentDidMount: function() {
        this.calculateSizing(this.getInitialState());
    },

    shouldComponentUpdate: function(nextProps, nextState) {
        // this is required because we don't pass in the containing element size as a property :-/
        // if size changes don't update yet because state will change in a moment
        this.calculateSizing(nextState)

        // compare props and state to determine if we should re-render
        // NOTE: this is essentially the same as React.addons.PureRenderMixin but
        // we currently need to recalculate the container size here.
        return !_.isEqual(this.props, nextProps) || !_.isEqual(this.state, nextState);
    },

    // availableWidth, minColumnWidth, # of columns
    // previousWidths, prevWidth
    calculateColumnWidths: function(availableWidth, minColumnWidth, colDefs, prevAvailableWidth, prevColumnWidths) {
        // TODO: maintain column spacing on a window resize

        var calcColumnWidth = (colDefs.length > 0) ? availableWidth / colDefs.length : minColumnWidth;
        var columnWidths = colDefs.map(function (column, idx) {
            return (minColumnWidth > calcColumnWidth) ? minColumnWidth : calcColumnWidth;
        });

        return columnWidths;
    },

    calculateSizing: function(prevState) {
        var element = this.getDOMNode(); //React.findDOMNode(this);

        // account for padding of our parent
        var style = window.getComputedStyle(element.parentElement, null);
        var paddingTop = Math.ceil(parseFloat(style.getPropertyValue("padding-top")));
        var paddingLeft = Math.ceil(parseFloat(style.getPropertyValue("padding-left")));
        var paddingRight = Math.ceil(parseFloat(style.getPropertyValue("padding-right")));

        var width = element.parentElement.offsetWidth - paddingLeft - paddingRight;
        var height = element.parentElement.offsetHeight - paddingTop;

        if (width !== prevState.width || height !== prevState.height) {
            var updatedState = {
                width: width,
                height: height
            };

            if (width !== prevState.width) {
                // NOTE: we remove 2 pixels from width to allow for a border pixel on each side
                var tableColumnWidths = this.calculateColumnWidths(width - 2, this.props.minColumnWidth, this.props.data.cols, prevState.width, prevState.columnWidths);
                updatedState.columnWidths = tableColumnWidths;
            }

            this.setState(updatedState);
        }
    },

    isSortable: function() {
        return (this.props.setSortFn !== undefined);
    },

    setSort: function(fieldId) {
        this.props.setSortFn(fieldId);

        MetabaseAnalytics.trackEvent('QueryBuilder', 'Set Sort', 'table column');
    },

    cellClicked: function(rowIndex, columnIndex) {
        this.props.cellClickedFn(rowIndex, columnIndex);
    },

    popoverFilterClicked: function(rowIndex, columnIndex, operator) {
        this.props.cellClickedFn(rowIndex, columnIndex, operator);
        this.setState({ popover: null });
    },

    rowGetter: function(rowIndex) {
        var row = {
            hasPopover: this.state.popover && this.state.popover.rowIndex === rowIndex || false
        };
        for (var i = 0; i < this.props.data.rows[rowIndex].length; i++) {
            row[i] = this.props.data.rows[rowIndex][i];
        }
        return row;
    },

    showPopover: function(rowIndex, cellDataKey) {
        this.setState({
            popover: {
                rowIndex: rowIndex,
                cellDataKey: cellDataKey
            }
        });
    },

    handleClickOutside: function() {
        this.setState({ popover: null });
    },

    cellRenderer: function(cellData, cellDataKey, rowData, rowIndex, columnData, width) {
        // TODO: should we be casting all values toString()?
        cellData = (cellData !== null) ? cellData.toString() : null;

        var key = 'cl'+rowIndex+'_'+cellDataKey;
        if (this.props.cellIsClickableFn(rowIndex, cellDataKey)) {
            return (<a key={key} className="link" href="#" onClick={this.cellClicked.bind(null, rowIndex, cellDataKey)}>{cellData}</a>);
        } else {
            var popover = null;
            if (this.state.popover && this.state.popover.rowIndex === rowIndex && this.state.popover.cellDataKey === cellDataKey) {
                var tetherOptions = {
                    targetAttachment: "middle center",
                    attachment: "middle center"
                };
                var operators = ["<", "=", "≠", ">"].map(function(operator) {
                    return (<li key={operator} className="p2 text-brand-hover" onClick={this.popoverFilterClicked.bind(null, rowIndex, cellDataKey, operator)}>{operator}</li>);
                }, this);
                popover = (
                    <Popover
                        tetherOptions={tetherOptions}
                        handleClickOutside={this.handleClickOutside}
                    >
                        <div className="bg-white bordered shadowed p1">
                            <ul className="h1 flex align-center">{operators}</ul>
                        </div>
                    </Popover>
                );
            }
            return (
                <div key={key}>
                    <div onClick={this.showPopover.bind(null, rowIndex, cellDataKey)}>{cellData}</div>
                    {popover}
                </div>
            );
        }
    },

    columnResized: function(width, idx) {
        var tableColumnWidths = this.state.columnWidths.slice();
        tableColumnWidths[idx] = width;
        this.setState({
            columnWidths: tableColumnWidths
        });
        this.isColumnResizing = false;
    },

    tableHeaderRenderer: function(columnIndex) {
        var column = this.props.data.cols[columnIndex],
            colVal = (column && column.display_name && column.display_name.toString()) ||
                     (column && column.name && column.name.toString());

        var headerClasses = cx({
            'MB-DataTable-header' : true,
            'flex': true,
            'align-center': true,
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
                <div key={columnIndex} className={headerClasses} onClick={this.setSort.bind(null, fieldId)}>
                    {colVal}
                    <span className="ml1">
                        {sortChevron}
                    </span>
                </div>
            );
        } else {
            return (<div className={headerClasses}>{colVal}</div>);
        }
    },

    render: function() {
        if(!this.props.data) {
            return false;
        }

        var component = this;
        var tableColumns = this.props.data.cols.map(function (column, idx) {
            var colVal = (column !== null) ? column.name.toString() : null;
            var colWidth = component.state.columnWidths[idx];

            if (!colWidth) {
                colWidth = 75;
            }

            return (
                <Column
                    key={'col_' + idx}
                    className="MB-DataTable-column"
                    width={colWidth}
                    isResizable={true}
                    headerRenderer={component.tableHeaderRenderer.bind(null, idx)}
                    cellRenderer={component.cellRenderer}
                    dataKey={idx}
                    label={colVal}>
                </Column>
            );
        });

        return (
            <Table
                className="MB-DataTable"
                rowHeight={35}
                rowGetter={this.rowGetter}
                rowsCount={this.props.data.rows.length}
                width={this.state.width}
                maxHeight={this.state.height}
                headerHeight={50}
                isColumnResizing={this.isColumnResizing}
                onColumnResizeEndCallback={component.columnResized}>
                {tableColumns}
            </Table>
        );
    }
});
