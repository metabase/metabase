'use strict';

import FixedDataTable from 'fixed-data-table';
import Icon from './icon.react';

var cx = React.addons.classSet;
var Table = FixedDataTable.Table;
var Column = FixedDataTable.Column;

export default React.createClass({
    displayName: 'QueryVisualizationObjectDetailTable',
    propTypes: {
        data: React.PropTypes.object
    },

    getInitialState: function() {
        return {
            width: 0,
            height: 0
        };
    },

    componentDidMount: function() {
        this.calculateSizing(this.getInitialState());
    },

    componentDidUpdate: function(prevProps, prevState) {
        this.calculateSizing(prevState);
    },

    calculateSizing: function(prevState) {
        var element = this.getDOMNode(); //React.findDOMNode(this);

        // account for padding above our parent
        var style = window.getComputedStyle(element.parentElement, null);
        var paddingTop = Math.ceil(parseFloat(style.getPropertyValue("padding-top")));

        var width = element.parentElement.offsetWidth;
        var height = element.parentElement.offsetHeight - paddingTop;

        if (width !== prevState.width || height !== prevState.height) {
            var updatedState = {
                width: width,
                height: height
            };

            this.setState(updatedState);
        }
    },

    rowGetter: function(rowIndex) {
        // Remember that we are pivoting the data, so for row 5 we want to return an array with [coldef, value]
        return [this.props.data.cols[rowIndex], this.props.data.rows[0][rowIndex]];
    },

    cellClicked: function(rowIndex, columnIndex) {
        this.props.cellClickedFn(rowIndex, columnIndex);
    },

    cellRenderer: function(cellData, cellDataKey, rowData, rowIndex, columnData, width) {
        // TODO: should we be casting all values toString()?
        // Check out the expected format of each row above in the rowGetter() function
        var row = this.rowGetter(rowIndex),
            cell,
            key = 'cl'+rowIndex+'_'+cellDataKey;

        if (cellDataKey === 'field') {
            var colValue = (row[0] !== null) ? row[0].name.toString() : null;
            return (<div key={key}>{colValue}</div>);
        } else {
            // TODO: should we be casting all values toString()?
            var cellValue = (row[1] !== null) ? row[1].toString() : null;

            // NOTE: that the values to our function call look off, but that's because we are un-pivoting them
            if (this.props.cellIsClickableFn(0, rowIndex)) {
                return (<a key={key} href="#" onClick={this.cellClicked.bind(null, 0, rowIndex)}>{cellValue}</a>);
            } else {
                return (<div key={key}>{cellValue}</div>);
            }
        }
    },

    render: function() {
        if(!this.props.data) {
            return false;
        }

        var fieldColumnWidth = 150,
            valueColumnWidth = (this.state.width - fieldColumnWidth),
            headerHeight = 50,
            rowHeight = 35,
            totalHeight = (this.props.data.cols.length * rowHeight) + headerHeight + 2; // 2 extra pixels for border

        return (
            <Table
                className="MB-DataTable"
                rowHeight={rowHeight}
                rowGetter={this.rowGetter}
                rowsCount={this.props.data.cols.length}
                width={this.state.width}
                height={totalHeight}
                headerHeight={headerHeight}>

                <Column
                    className="MB-DataTable-column"
                    width={fieldColumnWidth}
                    isResizable={false}
                    cellRenderer={this.cellRenderer}
                    dataKey={'field'}
                    label={'Field'}>
                </Column>

                <Column
                    className="MB-DataTable-column"
                    width={valueColumnWidth}
                    isResizable={false}
                    cellRenderer={this.cellRenderer}
                    dataKey={'value'}
                    label={'Value'}>
                </Column>
            </Table>
        );
    }
});
