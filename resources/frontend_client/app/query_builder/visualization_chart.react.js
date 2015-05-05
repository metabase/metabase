'use strict';
/*global CardRenderer*/

var QueryVisualizationChart = React.createClass({
    displayName: 'QueryVisualizationChart',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        data: React.PropTypes.object
    },

    getInitialState: function () {
        return {
            chartId: Math.floor((Math.random() * 698754) + 1)
        };
    },

    shouldComponentUpdate: function(nextProps, nextState) {
        // a chart only needs re-rendering when the result itself changes OR the chart type is different
        // NOTE: we are purposely doing an identity comparison here with props.result and NOT a value comparison
        if (this.props.data == nextProps.data &&
                this.props.card.display === nextProps.card.display) {
            return false;
        } else {
            return true;
        }
    },

    componentDidMount: function () {
        this.renderChart();
    },

    componentDidUpdate: function () {
        this.renderChart();
    },

    renderChart: function () {
        if (this.props.data) {
            // TODO: it would be nicer if this didn't require the whole card
            CardRenderer[this.props.card.display](this.state.chartId, this.props.card, this.props.data);
        }
    },

    render: function () {
        // rendering a chart of some type
        var titleId = 'card-title--'+this.state.chartId;
        var innerId = 'card-inner--'+this.state.chartId;

        return (
            <div className="Card--{this.props.card.display} Card-outer px1" id={this.state.chartId}>
                <div id={titleId} className="text-centered"></div>
                <div id={innerId} className="card-inner"></div>
            </div>
        );
    }
});
