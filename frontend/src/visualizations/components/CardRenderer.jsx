import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";

import * as charting from "metabase/card/lib/CardRenderer";

import { getSettingsForVisualization, setLatitudeAndLongitude } from "metabase/lib/visualization_settings";

@ExplicitSize
export default class CardRenderer extends Component {
    static propTypes = {
        card: PropTypes.object.isRequired,
        data: PropTypes.object,
        chartType: PropTypes.string.isRequired
    };

    shouldComponentUpdate(nextProps, nextState) {
        // a chart only needs re-rendering when the result itself changes OR the chart type is different
        // NOTE: we are purposely doing an identity comparison here with props.result and NOT a value comparison
        if (this.props.data == nextProps.data &&
            this.props.card.display === nextProps.card.display &&
            JSON.stringify(this.props.card.visualization_settings) === JSON.stringify(nextProps.card.visualization_settings) &&
            this.props.width === nextProps.width &&
            this.props.height === nextProps.height
        ) {
            return false;
        } else {
            return true;
        }
    }

    componentDidMount() {
        this.renderChart();
    }

    componentDidUpdate() {
        this.renderChart();
    }

    renderChart() {
        let element = ReactDOM.findDOMNode(this.refs.chart)
        if (this.props.data) {
            try {
                // always ensure we have the most recent visualization settings to use for rendering
                var vizSettings = getSettingsForVisualization(this.props.card.visualization_settings, this.props.card.display);

                var card = {
                    ...this.props.card,
                    visualization_settings: vizSettings
                };

                if (this.props.chartType === "pin_map") {
                    // call signature is (elementId, card, updateMapCenter (callback), updateMapZoom (callback))

                    // identify the lat/lon columns from our data and make them part of the viz settings so we can render maps
                    card.visualization_settings = setLatitudeAndLongitude(card.visualization_settings, this.props.data.cols);

                    // these are example callback functions that could be passed into the renderer
                    var updateMapCenter = (lat, lon) => {
                        this.props.onUpdateVisualizationSetting(["map", "center_latitude"], lat);
                        this.props.onUpdateVisualizationSetting(["map", "center_longitude"], lat);
                    };

                    var updateMapZoom = (zoom) => {
                        this.props.onUpdateVisualizationSetting(["map", "zoom"], zoom);
                    };

                    charting.CardRenderer[this.props.chartType](element, card, updateMapCenter, updateMapZoom);
                } else {
                    // TODO: it would be nicer if this didn't require the whole card
                    charting.CardRenderer[this.props.chartType](element, card, this.props.data, this.props.series);
                }
            } catch (err) {
                console.error(err);
                this.props.onRenderError(err.message || err);
            }
        }
    }

    render() {
        return (
            <div className="Card-outer px1">
                <div ref="chart"></div>
            </div>
        );
    }
}
