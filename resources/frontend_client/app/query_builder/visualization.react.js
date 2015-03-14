'use strict';

var QueryVisualization = React.createClass({
    getInitialState: function () {
        return {
            type: 'table',
            chartId: Math.floor((Math.random() * 698754) + 1)
        };
    },
    componentDidMount: function () {
        if (this.state.type !== 'table') {
            CardRenderer[this.state.type](this.state.chartId, this.props.card, this.props.result.data);
        }
    },
    componentDidUpdate: function () {
        if (this.state.type !== 'table') {
            CardRenderer[this.state.type](this.state.chartId, this.props.card, this.props.result.data);
        }
    },
    _changeType: function (type) {
        this.setState({
            type: type
        });
        this.props.setDisplay(type);
    },
    render: function () {
        // for table rendering
        var tableRows,
            tableHeaders,
            table;
        // for chart rendering
        var titleId,
            innerId;

        if(this.props.result && this.props.result.data) {
            if(this.state.type === 'table') {
                tableRows = this.props.result.data.rows.map(function (row) {
                    var rowCols = row.map(function (data) {
                        return (<td>{data.toString()}</td>)
                    });

                    return (<tr>{rowCols}</tr>);
                });

                tableHeaders = this.props.result.data.columns.map(function (column) {
                    return (
                        <th>{column.toString()}</th>
                    );
                });

                table = (
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
                );
            } else {
                titleId = 'card-title--'+this.state.chartId;
                innerId = 'card-inner--'+this.state.chartId;
            }
        }

        var viz;
        if(this.state.type != 'table') {
            viz = (
                <div class="Card--{this.state.type} Card-outer px1" id={this.state.chartId}>
                    <div id={titleId} class="text-centered"></div>
                    <div id={innerId} class="card-inner"></div>
                </div>
            );
        } else {
            viz = (
                <div className="Table-wrapper">
                    {table}
                </div>
            );
        }

        var types = [
            'table',
            'line',
            'bar',
            'pie',
            'area',
            'timeseries'
        ], typeControls = types.map(function (type) {
            if(this.props.result) {
                var buttonClasses = cx({
                    'ActionButton': true,
                    'ActionButton--primary' : (type == this.state.type)
                })
                return (
                    <a className={buttonClasses} href="#" onClick={this._changeType.bind(null, type)}>{type}</a>
                );
            } else {
                return false;
            }
        }.bind(this));

        return (
            <div>
                <div className="TypeControls">
                    <div className="wrapper">
                        {typeControls}
                    </div>
                </div>
                {viz}
            </div>
        );
    }
});
