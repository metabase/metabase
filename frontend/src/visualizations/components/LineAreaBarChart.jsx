import React, { Component, PropTypes } from "react";

import CardRenderer from "./CardRenderer.jsx";
import LegendHeader from "./LegendHeader.jsx";
import ChartTooltip from "./ChartTooltip.jsx";

import { isNumeric, isDate, isDimension, isString } from "metabase/lib/schema_metadata";
import { isSameSeries } from "metabase/visualizations/lib/utils";
import Urls from "metabase/lib/urls";

import { MinColumnsError, MinRowsError } from "metabase/visualizations/lib/errors";

import crossfilter from "crossfilter";
import _ from "underscore";
import cx from "classnames";

export default class LineAreaBarChart extends Component {
    static noHeader = true;
    static supportsSeries = true;

    static isSensible(cols, rows) {
        return rows.length > 1 && cols.length > 1;
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
        if (rows.length < 1) { throw new MinRowsError(1, rows.length); }
    }

    static seriesAreCompatible(initialSeries, newSeries) {
        if (newSeries.card.dataset_query.type === "query") {
            // no bare rows
            if (newSeries.card.dataset_query.query.aggregation[0] === "rows") {
                return false;
            }
            // must have one and only one breakout
            if (newSeries.card.dataset_query.query.breakout.length !== 1) {
                return false;
            }
        }

        return columnsAreCompatible(initialSeries.data.cols, newSeries.data.cols);
    }

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

    static defaultProps = {
        allowSplitAxis: true
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
                    card: { ...s.card, name: o.key, id: null },
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
        let { hovered, isDashboard, onAddSeries, onRemoveSeries, extraActions, allowSplitAxis } = this.props;
        let { series, isMultiseries } = this.state;

        let card = this.props.series[0].card;
        const chartType = this.constructor.identifier;

        return (
            <div className={cx("flex flex-column p1", this.getHoverClasses(), this.props.className)}>
                { (isDashboard && isMultiseries) &&
                    <a href={card.id && Urls.card(card.id)} className="Card-title pt1 px1 flex-no-shrink no-decoration h3 text-bold" style={{fontSize: '1em'}}>{card.name}</a>
                }
                { (isDashboard || isMultiseries) &&
                    <LegendHeader
                        className="flex-no-shrink"
                        series={series}
                        onAddSeries={isMultiseries ? undefined : onAddSeries}
                        onRemoveSeries={onRemoveSeries}
                        extraActions={extraActions}
                        hovered={hovered}
                        onHoverChange={this.props.onHoverChange}
                    />
                }
                <CardRenderer
                    {...this.props}
                    chartType={chartType}
                    series={series}
                    className="flex-full"
                    allowSplitAxis={isMultiseries ? false : allowSplitAxis}
                />
                <ChartTooltip series={series} hovered={hovered} />
            </div>
        );
    }
}

function columnsAreCompatible(colsA, colsB) {
    if (!(colsA && colsB && colsA.length >= 2 && colsB.length >= 2)) {
        return false;
    }
    // second column must be numeric
    if (!isNumeric(colsA[1]) || !isNumeric(colsB[1])) {
        return false;
    }
    // both or neither must be dates
    if (isDate(colsA[0]) !== isDate(colsB[0])) {
        return false;
    }
    // both or neither must be numeric
    if (isNumeric(colsA[0]) !== isNumeric(colsB[0])) {
        return false;
    }
    return true;
}
