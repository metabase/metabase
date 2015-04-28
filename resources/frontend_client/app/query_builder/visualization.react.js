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
    setDisplay: function (val) {
        console.log('val', val);
        // notify our parent about our change
        this.props.setDisplayFn(val);
    },
    render: function () {
        if(!this.props.result) {
            return false;
        }

        var viz;
        if(this.props.result.error) {
            // TODO: error messaging?
        } else if(this.props.result.data) {
            if(this.props.card.display !== "table") {
                // rendering a chart of some type
                var titleId = 'card-title--'+this.state.chartId;
                var innerId = 'card-inner--'+this.state.chartId;

                viz = (
                    <div className="Card--{this.props.card.display} Card-outer px1" id={this.state.chartId}>
                        <div id={titleId} className="text-centered"></div>
                        <div id={innerId} className="card-inner"></div>
                    </div>
                );
            } else {
                // render all non-chart types as a table
                viz = (
                    <QueryVisualizationTable data={this.props.result.data} />
                );
            }
        }

        var types = [
            'table',
            'line',
            'bar',
            'pie',
            'area',
            'timeseries'
        ];

        return (
            <div className="full flex flex-column">
                <div className="Visualization full flex-full">
                    {viz}
                </div>
                <div className="VisualizationSettings">
                    Show as: DERP
                </div>
            </div>
        );
    }
});
