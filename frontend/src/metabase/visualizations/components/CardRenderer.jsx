/* eslint "react/prop-types": "warn" */

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";

import { isSameSeries } from "metabase/visualizations/lib/utils";

import dc from "dc";

@ExplicitSize
export default class CardRenderer extends Component {
    static propTypes = {
        series: PropTypes.array.isRequired,
        width: PropTypes.number,
        height: PropTypes.number,
        renderer: PropTypes.func.isRequired,
        onRenderError: PropTypes.func.isRequired,
        className: PropTypes.string
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
            // Prevents memory leak
            dc.chartRegistry.deregister(this._chart);
            delete this._chart;
        }
    }

    renderChart() {
        if (this.props.width == null || this.props.height == null) {
            return;
        }

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
            this._chart = this.props.renderer(element, this.props);
        } catch (err) {
            console.error(err);
            this.props.onRenderError(err.message || err);
        }
    }

    render() {
        return (
            <div className={this.props.className}></div>
        );
    }
}
