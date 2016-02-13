import React, { Component, PropTypes } from "react";

import CardRenderer from "./CardRenderer.jsx";
import LegendHeader from "./LegendHeader.jsx"

import TooltipPopover from "metabase/components/TooltipPopover.jsx"

import { formatNumber, formatValue } from "metabase/lib/formatting";

import _ from "underscore";
import cx from "classnames";

export default class LineAreaBarChart extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            hovered: null,
        };

        _.bindAll(this, "onSeriesHoverChange")
    }

    static propTypes = {
        series: PropTypes.array.isRequired,
        onAddSeries: PropTypes.func,
        extraActions: PropTypes.node
    };

    onSeriesHoverChange(index, element, d, axisIndex) {
        // disable tooltips on lines
        if (element && element.classList.contains("line")) {
            element = null;
        }
        this.setState({ hovered: index == null ? null : { index, element, data: d && d.data, axisIndex } });
    }

    getHoverClasses() {
        const { hovered } = this.state;
        if (hovered != null) {
            let seriesClasses = _.range(0,5).filter(n => n !== hovered.index).map(n => "mute-"+n);
            let axisClasses =
                hovered.axisIndex === 0 ? "mute-yr" :
                hovered.axisIndex === 1 ? "mute-yl" :
                null;
            return seriesClasses.concat(axisClasses);
        } else {
            return null;
        }
    }

    renderTooltip() {
        const { series } = this.props;
        const { hovered } = this.state;
        return hovered && hovered.element &&
            <TooltipPopover
                target={hovered.element}
                verticalAttachments={["bottom", "top"]}
            >
                <div className="py1 px2">
                    <div>
                        <span className="ChartTooltip-name">{formatValue(hovered.data.key, series[hovered.index].data.cols[0])}</span>
                    </div>
                    <div>
                        <span className="ChartTooltip-value">{formatNumber(hovered.data.value)}</span>
                    </div>
                </div>
            </TooltipPopover>
    }

    render() {
        let { series, onAddSeries, extraActions } = this.props;
        return (
            <div className={cx("flex flex-full flex-column p1", this.getHoverClasses())}>
                <LegendHeader series={series} onAddSeries={onAddSeries} extraActions={extraActions} onSeriesHoverChange={this.onSeriesHoverChange} />
                <CardRenderer className="flex-full" {...this.props} onHoverChange={this.onSeriesHoverChange} />
                {this.renderTooltip()}
            </div>
        );
    }
}
