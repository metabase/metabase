'use strict';
/*global */

var QueryVisualizationTable = React.createClass({
    displayName: 'QueryVisualizationTable',
    propTypes: {
        data: React.PropTypes.object
    },

    getDefaultProps: function() {
        return {
            maxRows: 100,
            page: 1
        };
    },

    isSortable: function() {
        return (this.props.setSortFn !== undefined);
    },

    setSort: function(fieldId) {
        this.props.setSortFn(fieldId);
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
