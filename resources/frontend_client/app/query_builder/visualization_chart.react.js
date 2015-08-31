'use strict';

import { CardRenderer } from '../card/card.charting';

export default React.createClass({
    displayName: 'QueryVisualizationChart',
    propTypes: {
        visualizationSettingsApi: React.PropTypes.object.isRequired,
        card: React.PropTypes.object.isRequired,
        data: React.PropTypes.object
    },

    getInitialState: function() {
        return {
            chartId: Math.floor((Math.random() * 698754) + 1),
            width: 0,
            height: 0,
        };
    },

    shouldComponentUpdate: function(nextProps, nextState) {
        this.calculateSizing(nextState);
        // a chart only needs re-rendering when the result itself changes OR the chart type is different
        // NOTE: we are purposely doing an identity comparison here with props.result and NOT a value comparison
        if (this.state.error === nextState.error &&
                this.props.data == nextProps.data &&
                this.props.card.display === nextProps.card.display &&
                JSON.stringify(this.props.card.visualization_settings) === JSON.stringify(nextProps.card.visualization_settings) &&
                this.state.width === nextState.width && this.state.height === nextState.height
        ) {
            return false;
        } else {
            return true;
        }
    },
    componentDidMount: function() {
        this.calculateSizing(this.state);
        this.renderChart();
    },

    componentDidUpdate: function() {
        this.renderChart();
    },

    calculateSizing: function(prevState) {
        var width = CardRenderer.getAvailableCanvasWidth(this.state.chartId);
        var height = CardRenderer.getAvailableCanvasHeight(this.state.chartId);
        if (width !== prevState.width || height !== prevState.height) {
            this.setState({ width, height });
        }
    },

    renderChart: function () {
        if (this.props.data) {
            // validate the shape of the data against our chosen display and if we don't have appropriate data
            // then lets inform the user that this isn't going to work so they can do something better
            var dataError;
            if (this.props.card.display === "pin_map" &&
                    !this.hasLatitudeAndLongitudeColumns(this.props.data.cols)) {
                dataError = "Bummer.  We can't actually do a pin map for this data because we require both a latitude and longitude column.";
            } else if (this.props.data.columns && this.props.data.columns.length < 2) {
                dataError = "Doh!  The data from your query doesn't fit the chosen display choice.  This visualization requires at least 2 columns of data.";

            } else if ((this.props.card.display === "line" || this.props.card.display === "area") &&
                            this.props.data.rows && this.props.data.rows.length < 2) {
                dataError = "No dice.  We only have 1 data point to show and that's not enough for a line chart.";
            }

            if (dataError) {
                this.setState({
                    error: dataError
                });
                return;
            } else {
                this.setState({
                    error: null
                });
            }

            try {
                // always ensure we have the most recent visualization settings to use for rendering
                var vizSettings = this.props.visualizationSettingsApi.getSettingsForVisualization(this.props.card.visualization_settings, this.props.card.display);

                // be as immutable as possible and build a card like structure used for charting
                var cardIsh = {
                    name: this.props.card.name,
                    display: this.props.card.display,
                    visualization_settings: vizSettings
                };

                if (this.props.card.display === "pin_map") {
                    // call signature is (elementId, card, updateMapCenter (callback), updateMapZoom (callback))

                    // identify the lat/lon columns from our data and make them part of the viz settings so we can render maps
                    cardIsh.visualization_settings = this.props.visualizationSettingsApi.setLatitudeAndLongitude(cardIsh.visualization_settings, this.props.data.cols);

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

                    CardRenderer[this.props.card.display](this.state.chartId, cardIsh, no_op, no_op);
                } else {
                    // TODO: it would be nicer if this didn't require the whole card
                    CardRenderer[this.props.card.display](this.state.chartId, cardIsh, this.props.data);
                }
            } catch (err) {
                console.error(err);
                this.setState({
                    error: (err.message || err)
                });
            }
        }
    },

    render: function() {
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
            <div className={"Card--" + this.props.card.display + " Card-outer px1"} id={this.state.chartId}>
                <div id={titleId} className="text-centered"></div>
                <div id={innerId} className="card-inner"></div>
                {errorMessage}
            </div>
        );
    }
});
