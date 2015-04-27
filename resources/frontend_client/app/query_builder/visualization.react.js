'use strict';
/*global cx, CardRenderer*/

var QueryVisualization = React.createClass({
    displayName: 'QueryVisualization',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        result: React.PropTypes.object,
        setDisplayFn: React.PropTypes.func.isRequired
    },
    getInitialState: function () {
        return {
            chartId: Math.floor((Math.random() * 698754) + 1)
        };
    },
    componentDidMount: function () {
        this.renderChartIfNeeded();
    },
    componentDidUpdate: function () {
        this.renderChartIfNeeded();
    },
    renderChartIfNeeded: function () {
        if (this.props.card.display !== "table") {
            // TODO: it would be nicer if this didn't require the whole card
            CardRenderer[this.props.card.display](this.state.chartId, this.props.card, this.props.result.data);
        }
    },
    setDisplay: function (display) {
        // notify our parent about our change
        this.props.setDisplayFn(display);
    },
    render: function () {
        if(!this.props.result) {
            return false;
        }

        // for table rendering
        var tableRows,
            tableHeaders,
            table;
        // for chart rendering
        var titleId,
            innerId;

        if(this.props.result && this.props.result.data) {
            if(this.props.card.display === "table") {
                tableRows = this.props.result.data.rows.map(function (row) {
                    var rowCols = row.map(function (data) {
                        return (<td>{data.toString()}</td>);
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
        if(this.props.card.display !== "table") {
            viz = (
                <div class="Card--{this.props.card.display} Card-outer px1" id={this.state.chartId}>
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
                    'Button': true,
                    'Button--primary' : (type === this.props.card.display)
                });
                return (
                    <a className={buttonClasses} href="#" onClick={this.setDisplay.bind(null, type)}>{type}</a>
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
