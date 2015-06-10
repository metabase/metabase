'use strict';

import FixedDataTable from 'fixed-data-table';

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

    componentDidMount: function() {
        this.calculateBoundaries();
    },

    componentDidUpdate: function(prevProps, prevState) {
        this.calculateBoundaries();
    },

    calculateBoundaries: function() {
        var element = this.getDOMNode(); //React.findDOMNode(this);
        var width = element.parentElement.offsetWidth;
        var height = element.parentElement.offsetHeight;

        if (width !== this.state.width && height !== this.state.height) {
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
        return this.props.data.rows[rowIndex];
    },

    render: function() {
        if(!this.props.data) {
            return false;
        }

        // remember that page numbers begin with 1 but our data indexes begin with 0, so account for that
        var offset = ((this.props.page - 1) * this.props.maxRows),
            limit = (this.props.page * this.props.maxRows) - 1;

        if (limit > this.props.data.rows.length) {
            limit = this.props.data.rows.length;
        }

        var tableRows = [];
        for (var i=offset; i < limit; i++) {
            var row = this.props.data.rows[i];

            var rowCols = [];
            for (var k=0; k < row.length; k++) {
                // TODO: should we be casting all values toString()?
                var rowVal = (row[k] !== null) ? row[k].toString() : null;
                rowCols.push((<td>{rowVal}</td>));
            }

            tableRows.push((<tr>{rowCols}</tr>));
        }

        var component = this;
        var tableHeaders = this.props.data.cols.map(function (column, idx) {
            var colVal = (column !== null) ? column.name.toString() : null;

            if (component.isSortable()) {
                return (<th onClick={component.setSort.bind(null, column.id)}>{colVal}</th>);
            } else {
                return (<th>{colVal}</th>);
            }
        });

        var calcColumnWidth = 75;
        if (this.props.data.cols.length > 0) {
            calcColumnWidth = this.state.width / this.props.data.cols.length;
        }
        var tableColumns = this.props.data.cols.map(function (column, idx) {
            var colVal = (column !== null) ? column.name.toString() : null;
            var colWidth = (component.props.minColumnWidth > calcColumnWidth) ? component.props.minColumnWidth : calcColumnWidth;

            return (<Column label={colVal} width={colWidth} dataKey={idx}></Column>);
        });

        // return (
        //     <div className="QueryTable-wrapper Table-wrapper full">
        //         <table className="QueryTable Table">
        //             <thead>
        //                 <tr>
        //                     {tableHeaders}
        //                 </tr>
        //             </thead>
        //             <tbody>
        //                 {tableRows}
        //             </tbody>
        //         </table>
        //     </div>
        // );

        return (
            <Table
                rowHeight={35}
                rowGetter={this.rowGetter}
                rowsCount={this.props.data.rows.length}
                width={this.state.width}
                height={this.state.height}
                headerHeight={35}>
                {tableColumns}
            </Table>
        );
    }
});
