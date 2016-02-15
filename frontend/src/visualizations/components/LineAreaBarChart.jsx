import React, { Component, PropTypes } from "react";

import CardRenderer from "./CardRenderer.jsx";
import LegendHeader from "./LegendHeader.jsx";
import ChartTooltip from "./ChartTooltip.jsx";

import _ from "underscore";
import cx from "classnames";

export default class LineAreaBarChart extends Component {
    static propTypes = {
        series: PropTypes.array.isRequired,
        onAddSeries: PropTypes.func,
        extraActions: PropTypes.node
    };

    getHoverClasses() {
        const { hovered } = this.props;
        if (hovered != null && hovered.seriesIndex != null) {
            let seriesClasses = _.range(0,5).filter(n => n !== hovered.seriesIndex).map(n => "mute-"+n);
            let axisClasses =
                hovered.axisIndex === 0 ? "mute-yr" :
                hovered.axisIndex === 1 ? "mute-yl" :
                null;
            return seriesClasses.concat(axisClasses);
        } else {
            return null;
        }
    }

    render() {
        let { series, hovered, onAddSeries, extraActions } = this.props;
        return (
            <div className={cx("flex flex-full flex-column p1", this.getHoverClasses())}>
                <LegendHeader series={series} onAddSeries={onAddSeries} extraActions={extraActions} hovered={hovered} onHoverChange={this.props.onHoverChange} />
                <CardRenderer className="flex-full" {...this.props} />
                <ChartTooltip series={series} hovered={hovered} />
            </div>
        );
    }
}
