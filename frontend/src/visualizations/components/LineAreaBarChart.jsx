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
            hoveredIndex: null,
            hoveredElement: null
        };

        _.bindAll(this, "onSeriesHoverChange")
    }

    static propTypes = {};
    static defaultProps = {};

    onSeriesHoverChange(index, element, args) {
        if (element && element.classList.contains("line")) {
            element = null;
        }
        this.setState({ hoveredIndex: index, hoveredElement: element, hoveredData: args && args[0].data });
    }

    getHoverClasses() {
        const { hoveredIndex } = this.state;
        if (hoveredIndex != null) {
            return _.range(0,5).filter(n => n !== hoveredIndex).map(n => "mute-"+n);
        } else {
            return null;
        }
    }

    renderTooltip() {
        const { card, data } = this.props;
        const { hoveredData, hoveredIndex, hoveredElement } = this.state;
        const series = [{ card, data }].concat(this.props.series);
        return (hoveredElement && hoveredData && hoveredIndex != null &&
            <TooltipPopover
                target={hoveredElement}
                verticalAttachments={["bottom", "top"]}
            >
                <div className="py1 px2">
                    <div>
                        <span className="ChartTooltip-name">{formatValue(hoveredData.key, series[hoveredIndex].data.cols[0])}</span>
                    </div>
                    <div>
                        <span className="ChartTooltip-value">{formatNumber(hoveredData.value)}</span>
                    </div>
                </div>
            </TooltipPopover>
        )
    }

    render() {
        let { card, series, onAddSeries, extraActions } = this.props;
        return (
            <div className={cx("flex flex-full flex-column p1", this.getHoverClasses())}>
                <LegendHeader card={card} series={series} onAddSeries={onAddSeries} extraActions={extraActions} onSeriesHoverChange={this.onSeriesHoverChange} />
                <CardRenderer className="flex-full" {...this.props} onHoverChange={this.onSeriesHoverChange} />
                {this.renderTooltip()}
            </div>
        );
    }
}
