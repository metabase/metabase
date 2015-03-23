'use strict';

/*
    this component is used to create a table with a fixed header
    (and possibly other fixed parts in the future)
*/

var FixedTable = React.createClass({
    displayName: 'FixedTable',
    propTypes: {
      rows: React.PropTypes.array,
      columns: React.PropTypes.array
    },
    _rows: function () {
        return this.props.rows.map(function (row) {
            var rowCols = row.map(function (data) {
                return (<td>{data.toString()}</td>)
            });

            return (<tr>{rowCols}</tr>);
        });
    },
    _headers: function () {
        return this.props.columns.map(function (column) {
            return (
                <th>
                    <div className="FixedTable-headerInner">{column.toString()}</div>
                </th>
            );
        });
    },
    render: function () {
        return (
            <div className="FixedTable">
                <div className="FixedTable-headerBackground"></div>
                <div className="FixedTable-inner">
                    <table className="Table">
                        <thead>
                            <tr>
                                {this._headers()}
                            </tr>
                        </thead>
                        <tbody>
                            {this._rows()}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }
});
