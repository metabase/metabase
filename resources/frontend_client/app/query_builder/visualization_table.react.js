'use strict';
/*global */

var QueryVisualizationTable = React.createClass({
    displayName: 'QueryVisualizationTable',
    propTypes: {
        data: React.PropTypes.object
    },
    render: function () {
        if(!this.props.data) {
            return false;
        }

        var tableRows = this.props.data.rows.map(function (row) {
            var rowCols = row.map(function (data) {
                // TODO: should we be casting all values toString()?
                var rowVal = (data !== null) ? data.toString() : null;
                return (<td>{rowVal}</td>);
            });

            return (<tr>{rowCols}</tr>);
        });

        var tableHeaders = this.props.data.columns.map(function (column) {
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
