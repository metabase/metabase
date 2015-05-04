'use strict';
/*global */

var QueryVisualizationTable = React.createClass({
    displayName: 'QueryVisualizationTable',
    propTypes: {
        data: React.PropTypes.object
    },

    getDefaultProps: function() {
        return {
            maxRows: null
        };
    },

    render: function() {
        if(!this.props.data) {
            return false;
        }

        var rowLimit = this.props.data.rows.length;
        if (this.props.maxRows && this.props.data.rows.length > this.props.maxRows) {
            rowLimit = this.props.maxRows;
        }

        var tableRows = [];
        for (var i=0; i < rowLimit; i++) {
            var row = this.props.data.rows[i];

            var rowCols = [];
            for (var k=0; k < row.length; k++) {
                // TODO: should we be casting all values toString()?
                var rowVal = (row[k] !== null) ? row[k].toString() : null;
                rowCols.push((<td>{rowVal}</td>));
            }

            tableRows.push((<tr>{rowCols}</tr>));
        }

        if (rowLimit !== this.props.data.rows.length) {
            tableRows.push((
                <tr>
                    <td className="text-centered" colSpan={this.props.data.columns.length}>
                        <span className="text-brand text-bold">Too many rows to display!  Previewing {rowLimit} out of <span className="text-italic">{this.props.data.rows.length}</span> total rows.</span>
                    </td>
                </tr>
            ));
        }

        var tableHeaders = this.props.data.columns.map(function (column, idx) {
            var colVal = (column !== null) ? column.toString() : null;
            return (
                <th>{colVal}</th>
            );
        });

        return (
            <div className="QueryTable-wrapper Table-wrapper full">
                <table className="QueryTable Table">
                    <thead>
                        <tr>
                            {tableHeaders}
                        </tr>
                    </thead>
                    <tbody>
                        {tableRows}
                    </tbody>
                </table>
            </div>
        );
    }
});
