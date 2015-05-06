'use strict';
/*global CardRenderer*/

var QueryVisualizationChart = React.createClass({
    displayName: 'QueryVisualizationChart',
    propTypes: {
        visualizationSettingsApi: React.PropTypes.func.isRequired,
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
        if (this.state.error === nextState.error &&
                this.props.data == nextProps.data &&
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
            try {
                // always ensure we have the most recent visualization settings to use for rendering
                var card = this.props.card;
                var vizSettings = this.props.visualizationSettingsApi.getSettingsForVisualization(card.visualization_settings, card.display);
                card.visualization_settings = vizSettings;

                if (this.props.card.display === "pin_map") {
                    // call signature is (elementId, card, updateMapCenter (callback), updateMapZoom (callback))

                    // identify the lat/lon columns from our data and make them part of the viz settings so we can render maps
                    card.visualization_settings = this.props.visualizationSettingsApi.setLatitudeAndLongitude(card.visualization_settings, this.props.data.cols);

                    // these are example callback functions that could be passed into the renderer
                    // var updateMapCenter = function(lat, lon) {
                    //     scope.card.visualization_settings.map.center_latitude = lat;
                    //     scope.card.visualization_settings.map.center_longitude = lon;
                    //     scope.$apply();
                    // };

                    // var updateMapZoom = function(zoom) {
                    //     scope.card.visualization_settings.map.zoom = zoom;
                    //     scope.$apply();
                    // };

                    var no_op = function(a, b) {
                        // do nothing for now
                    };

                    CardRenderer[this.props.card.display](this.state.chartId, this.props.card, no_op, no_op);
                } else {
                    // TODO: it would be nicer if this didn't require the whole card
                    CardRenderer[this.props.card.display](this.state.chartId, this.props.card, this.props.data);
                }
            } catch (err) {
                this.setState({
                    error: (err.message || err)
                });
            }
        }
    },

    render: function () {
        // rendering a chart of some type
        var titleId = 'card-title--'+this.state.chartId;
        var innerId = 'card-inner--'+this.state.chartId;

        var errorMessage;
        if (this.state.error) {
            errorMessage = (
                <div className="QueryError flex full align-center text-error">
                    <div className="QueryError-iconWrapper">
                        <svg className="QueryError-icon" viewBox="0 0 32 32" width="64" height="64" fill="currentcolor">
                            <path d="M4 8 L8 4 L16 12 L24 4 L28 8 L20 16 L28 24 L24 28 L16 20 L8 28 L4 24 L12 16 z "></path>
                        </svg>
                    </div>
                    <span className="QueryError-message">{this.state.error}</span>
                </div>
            );
        }

        return (
            <div className="Card--{this.props.card.display} Card-outer px1" id={this.state.chartId}>
                <div id={titleId} className="text-centered"></div>
                <div id={innerId} className="card-inner"></div>
                {errorMessage}
            </div>
        );
    }
});
