import React, { Component, PropTypes } from "react";

import CardRenderer from "./components/CardRenderer.jsx";
import LegendHeader from "./components/LegendHeader.jsx"

import { MinColumnsError } from "./errors";

export default class AreaChart extends Component {
    static displayName = "Area";
    static identifier = "area";
    static iconName = "area";

    static noHeader = true;

    static isSensible(cols, rows) {
        return cols.length > 1;
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
    }

    render() {
        let { card, series, onAddSeries } = this.props;
        return (
            <div className="flex flex-full flex-column px2 py1">
                <LegendHeader card={card} series={series} onAddSeries={onAddSeries} />
                <CardRenderer className="flex-full" {...this.props} chartType="area" />
            </div>
        );
    }
}
