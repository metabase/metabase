import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";

import * as charting from "metabase/visualizations/lib/CardRenderer";

import { setLatitudeAndLongitude } from "metabase/lib/visualization_settings";
import { isSameSeries } from "metabase/visualizations/lib/utils";

import { getSettingsForVisualization } from "metabase/lib/visualization_settings";

@ExplicitSize
export default class CardRenderer extends Component {
    static propTypes = {
        chartType: PropTypes.string.isRequired,
        series: PropTypes.array.isRequired
    };

    shouldComponentUpdate(nextProps, nextState) {
        // a chart only needs re-rendering when the result itself changes OR the chart type is different
        let sameSize = (this.props.width === nextProps.width && this.props.height === nextProps.height);
        let sameSeries = isSameSeries(this.props.series, nextProps.series);
        return !(sameSize && sameSeries);
    }

    componentDidMount() {
        // avoid race condition with initial layout
        setTimeout(() => this.renderChart());
    }

    componentDidUpdate() {
        this.renderChart();
    }

    renderChart() {
        let { series } = this.props;
        let parent = ReactDOM.findDOMNode(this);
        let element = parent.firstChild;
        parent.removeChild(element);
        element = document.createElement("div");
        parent.appendChild(element);
        try {
            if (series[0] && series[0].data) {
                // augment with visualization settings
                series = series.map(s => ({
                    ...s,
                    card: {
                        ...s.card,
                        visualization_settings: getSettingsForVisualization(s.card.visualization_settings, this.props.chartType)
                    }
                }));

                if (this.props.chartType === "pin_map") {
                    // call signature is (elementId, card, updateMapCenter (callback), updateMapZoom (callback))

                    // identify the lat/lon columns from our data and make them part of the viz settings so we can render maps
                    let card = {
                        ...series[0].card,
                        visualization_settings: setLatitudeAndLongitude(series[0].card.visualization_settings, series[0].data.cols)
                    }

                    // these are example callback functions that could be passed into the renderer
                    var updateMapCenter = (lat, lon) => {
                        this.props.onUpdateVisualizationSetting(["map", "center_latitude"], lat);
                        this.props.onUpdateVisualizationSetting(["map", "center_longitude"], lat);
                    };

                    var updateMapZoom = (zoom) => {
                        this.props.onUpdateVisualizationSetting(["map", "zoom"], zoom);
                    };

                    charting.CardRenderer[this.props.chartType](element, { ...this.props, card, updateMapCenter, updateMapZoom });
                } else {
                    charting.CardRenderer[this.props.chartType](element, { ...this.props, series, card: series[0].card, data: series[0].data });
                }
            }
        } catch (err) {
            console.error(err);
            this.props.onRenderError(err.message || err);
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
