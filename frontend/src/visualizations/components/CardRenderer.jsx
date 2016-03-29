import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";

import * as charting from "metabase/visualizations/lib/CardRenderer";

import { isSameSeries } from "metabase/visualizations/lib/utils";
import { getSettingsForVisualization } from "metabase/lib/visualization_settings";

import dc from "dc";
import cx from "classnames";

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
        this.renderChart();
    }

    componentDidUpdate() {
        this.renderChart();
    }

    componentWillUnmount() {
        this._deregisterChart();
    }

    _deregisterChart() {
        if (this._chart) {
            dc.chartRegistry.deregister(this._chart);
            this._chart = null;
        }
    }

    renderChart() {
        let { series } = this.props;
        let parent = ReactDOM.findDOMNode(this);

        // deregister previous chart:
        this._deregisterChart();

        // reset the DOM:
        let element = parent.firstChild;
        if (element) {
            parent.removeChild(element);
        }

        // create a new container element
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

                this._chart = charting.CardRenderer[this.props.chartType](element, { ...this.props, series, card: series[0].card, data: series[0].data });
            }
        } catch (err) {
            console.error(err);
            this.props.onRenderError(err.message || err);
        }
    }

    render() {
        return (
            <div className={cx(this.props.className, "Card-outer")}></div>
        );
    }
}
