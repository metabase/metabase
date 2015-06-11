'use strict';

import FixedDataTable from 'fixed-data-table';
import Icon from './icon.react';

var Table = FixedDataTable.Table;
var Column = FixedDataTable.Column;

export default React.createClass({
    displayName: 'QueryVisualizationTable',
    propTypes: {
        data: React.PropTypes.object
    },

    getDefaultProps: function() {
        return {
            maxRows: 100,
            minColumnWidth: 75,
            page: 1
        };
    },

    getInitialState: function() {
        return {
            width: 800,
            height: 300
        };
    },

    componentWillReceiveProps: function(newProps) {

    },

    componentDidMount: function() {
        this.calculateBoundaries(this.getInitialState());
    },

    componentDidUpdate: function(prevProps, prevState) {
        this.calculateBoundaries(prevState);
    },

    calculateBoundaries: function(prevState) {
        var element = this.getDOMNode(); //React.findDOMNode(this);
        var width = element.parentElement.offsetWidth;
        var height = element.parentElement.offsetHeight;

        console.log(width, height);
        if (width !== prevState.width || height !== prevState.height) {
            console.log('updating dims');
            this.setState({
                width: width,
                height: height
            });
        }
    },

    isSortable: function() {
        return (this.props.setSortFn !== undefined);
    },

    setSort: function(fieldId) {
        this.props.setSortFn(fieldId);
    },

    rowGetter: function(rowIndex) {
        var actualIndex = ((this.props.page - 1) * this.props.maxRows) + rowIndex;
        return this.props.data.rows[actualIndex];
    },

    cellGetter: function(cellKey, row) {
        console.log(cellKey, row);
        // TODO: should we be casting all values toString()?
        // var rowVal = (row[k] !== null) ? row[k].toString() : null;
    },

    columnResized: function(width, columnKey) {
        console.log('resized', width, columnKey);
    },

    tableHeaderRenderer: function(columnIndex) {
        var column = this.props.data.cols[columnIndex],
            colVal = (column !== null) ? column.name.toString() : null,
            headerClasses = 'MB-DataTable-header flex align-center';

        if (this.isSortable()) {
            return (
                <div className={headerClasses} onClick={this.setSort.bind(null, column.id)}>
                    {colVal}
                    <span className="flex-align-right">
                        <Icon name="chevrondown" width="12px" height="12px"></Icon>
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

        // remember that page numbers begin with 1 but our data indexes begin with 0, so account for that
        // limit = end index in our data that we intend to show
        var limit = (this.props.page * this.props.maxRows) - 1;
        if (limit > this.props.data.rows.length) {
            limit = this.props.data.rows.length - 1;
        }

        // offset = start index in our data that we intend to show
        // rowCount = # of rows we intend to show
        // calcColumnWidth = the calculated pixels available for a column if all available columns are rendered
        var offset = ((this.props.page - 1) * this.props.maxRows),
            rowCount = (limit - offset) + 1,
            calcColumnWidth = (this.props.data.cols.length > 0) ? this.state.width / this.props.data.cols.length : 75;

        var component = this;
        var tableColumns = this.props.data.cols.map(function (column, idx) {
            var colVal = (column !== null) ? column.name.toString() : null;
            var colWidth = (component.props.minColumnWidth > calcColumnWidth) ? component.props.minColumnWidth : calcColumnWidth;

            return (
                <Column
                    className="MB-DataTable-column"
                    width={colWidth}
                    isResizable={true}
                    headerRenderer={component.tableHeaderRenderer.bind(null, idx)}
                    cellDataGetter={component.cellDataGetter}
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
                rowsCount={rowCount}
                width={this.state.width}
                height={this.state.height}
                headerHeight={35}
                onColumnResizeEndCallback={component.columnResized}>
                {tableColumns}
            </Table>
        );
    }
});
