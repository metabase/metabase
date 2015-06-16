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

    cellDataGetter: function(cellKey, row) {
        // Check out the expected format of each row above in the rowGetter() function
        if (cellKey === 'field') {
            return (row[0] !== null) ? row[0].name.toString() : null;
        } else {
            // TODO: should we be casting all values toString()?
            // TODO: handle linking and other value formatting
            return (row[1] !== null) ? row[1].toString() : null;
        }
    },

    render: function() {
        if(!this.props.data) {
            return false;
        }

        var fieldColumnWidth = 150,
            valueColumnWidth = (this.state.width - fieldColumnWidth);

        return (
            <Table
                className="MB-DataTable"
                rowHeight={35}
                rowGetter={this.rowGetter}
                rowsCount={this.props.data.cols.length}
                width={this.state.width}
                height={this.state.height}
                headerHeight={50}>

                <Column
                    className="MB-DataTable-column"
                    width={fieldColumnWidth}
                    isResizable={false}
                    cellDataGetter={this.cellDataGetter}
                    dataKey={'field'}
                    label={'Field'}>
                </Column>

                <Column
                    className="MB-DataTable-column"
                    width={valueColumnWidth}
                    isResizable={false}
                    cellDataGetter={this.cellDataGetter}
                    dataKey={'value'}
                    label={'Value'}>
                </Column>
            </Table>
        );
    }
});
