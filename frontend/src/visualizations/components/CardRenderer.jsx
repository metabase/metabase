import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";

import * as charting from "metabase/card/lib/CardRenderer";

import { getSettingsForVisualization, setLatitudeAndLongitude } from "metabase/lib/visualization_settings";

import _ from "underscore";

@ExplicitSize
export default class CardRenderer extends Component {
    static propTypes = {
        card: PropTypes.object.isRequired,
        data: PropTypes.object,
        chartType: PropTypes.string.isRequired
    };

    shouldComponentUpdate(nextProps, nextState) {
        function cardAndDataIsSame(a, b) {
            let sameData = a.data === b.data;
            let sameDisplay = (a.card && a.card.display) === (b.card && b.card.display);
            let sameVizSettings = (a.card && JSON.stringify(a.card.visualization_settings)) === (b.card && JSON.stringify(b.card.visualization_settings));
            return (sameData && sameDisplay && sameVizSettings);
        }

        // a chart only needs re-rendering when the result itself changes OR the chart type is different
        let sameSize = this.props.width === nextProps.width && this.props.height === nextProps.height;
        let sameCardAndData = cardAndDataIsSame(this.props, nextProps);
        let sameSeries = (this.props.series && this.props.series.length) === (nextProps.series && nextProps.series.length) &&
            _.zip(this.props.series, nextProps.series).reduce((acc, [a, b]) => acc && cardAndDataIsSame(a, b), true);
        return !(sameSize && sameCardAndData && sameSeries)
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
