import React, { Component, PropTypes } from "react";

import CardRenderer from "./components/CardRenderer.jsx";
import ChartTooltip from "./components/ChartTooltip.jsx";

import { MinColumnsError } from "metabase/visualizations/lib/errors";

export default class PieChart extends Component {
    static displayName = "Pie";
    static identifier = "pie";
    static iconName = "pie";

    static isSensible(cols, rows) {
        return cols.length === 2;
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
    }

    render() {
        const { series, hovered, className } = this.props;
        return (
            <div className={"flex " + className}>
                <CardRenderer {...this.props} className="flex-full" chartType="pie" />
                <ChartTooltip series={series} hovered={hovered} pinToMouse={true} />
            </div>
        );
    }
}
