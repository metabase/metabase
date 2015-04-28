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
                return (<td>{data.toString()}</td>);
            });

            return (<tr>{rowCols}</tr>);
        });

        var tableHeaders = this.props.data.columns.map(function (column) {
            return (
                <th>{column.toString()}</th>
            );
        });

        return (
            <div className="Table-wrapper">
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
