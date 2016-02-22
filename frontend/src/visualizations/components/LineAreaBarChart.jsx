import React, { Component, PropTypes } from "react";

import CardRenderer from "./CardRenderer.jsx";
import LegendHeader from "./LegendHeader.jsx";
import ChartTooltip from "./ChartTooltip.jsx";

import { isDimension, isString } from "metabase/lib/schema_metadata";
import { isSameSeries } from "metabase/visualizations/lib/utils";

import crossfilter from "crossfilter";
import _ from "underscore";
import cx from "classnames";

export default class LineAreaBarChart extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            series: null,
            isMultiseries: null
        };
    }

    static propTypes = {
        series: PropTypes.array.isRequired,
        onAddSeries: PropTypes.func,
        extraActions: PropTypes.node,
        isDashboard: PropTypes.bool
    };

    componentWillMount() {
        this.transformSeries(this.props);
    }

    componentWillReceiveProps(newProps) {
        if (isSameSeries(newProps.series, this.props.series)) {
            return;
        }
        this.transformSeries(newProps);
    }

    transformSeries(newProps) {
        let series = newProps.series;
        let isMultiseries = false;
        let s = series && series.length === 1 && series[0];
        if (s && s.data && s.data.cols.length > 2 && (isDimension(s.data.cols[1]) || isString(s.data.cols[1]))) {
            let dataset = crossfilter(s.data.rows);
            let groups = [0,1].map(i => dataset.dimension(d => d[i]).group());
            let cardinalities = groups.map(group => group.size())
            // only if the smaller dimension has cardinality < 10
            if (cardinalities[0] < 10 || cardinalities[1] < 10) {
                let dimensionIndex = (cardinalities[0] > cardinalities[1]) ? 1 : 0;
                series = groups[dimensionIndex].reduce(
                    (p, v) => p.concat([[...v.slice(0, dimensionIndex), ...v.slice(dimensionIndex+1)]]),
                    (p, v) => null, () => []
                ).all().map(o => ({
                    card: { ...s.card, name: o.key },
                    data: {
                        rows: o.value,
                        cols: [...s.data.cols.slice(0,dimensionIndex), ...s.data.cols.slice(dimensionIndex+1)]
                    }
                }));
                isMultiseries = true;
            }
        }
        this.setState({
            series,
            isMultiseries
        })
    }

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
        let { hovered, isDashboard, onAddSeries, extraActions } = this.props;
        let { series, isMultiseries } = this.state;
        return (
            <div className={cx("flex flex-column p1", this.getHoverClasses(), this.props.className)}>
                { (isDashboard || isMultiseries) &&
                    <LegendHeader
                        series={series}
                        onAddSeries={isMultiseries ? undefined : onAddSeries}
                        extraActions={extraActions}
                        hovered={hovered}
                        onHoverChange={this.props.onHoverChange}
                    />
                }
                <CardRenderer
                    {...this.props}
                    series={series}
                    className="flex-full"
                />
                <ChartTooltip series={series} hovered={hovered} />
            </div>
        );
    }
}
