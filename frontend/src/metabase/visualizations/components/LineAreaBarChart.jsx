import React, { Component, PropTypes } from "react";

import CardRenderer from "./CardRenderer.jsx";
import LegendHeader from "./LegendHeader.jsx";
import ChartTooltip from "./ChartTooltip.jsx";

import ColorSetting from "./settings/ColorSetting.jsx";

import { isNumeric, isDate, isDimension, isMetric } from "metabase/lib/schema_metadata";
import { isSameSeries } from "metabase/visualizations/lib/utils";
import Urls from "metabase/lib/urls";

import { MinRowsError } from "metabase/visualizations/lib/errors";

import crossfilter from "crossfilter";
import _ from "underscore";
import cx from "classnames";
import i from "icepick";

const DIMENSION_METRIC = "DIMENSION_METRIC";
const DIMENSION_METRIC_METRIC = "DIMENSION_METRIC_METRIC";
const DIMENSION_DIMENSION_METRIC = "DIMENSION_DIMENSION_METRIC";

const MAX_SERIES = 10;

const isDimensionMetric = (cols, strict = true) =>
    (!strict || cols.length === 2) &&
    isDimension(cols[0]) &&
    isMetric(cols[1])

const isDimensionDimensionMetric = (cols, strict = true) =>
    (!strict || cols.length === 3) &&
    isDimension(cols[0]) &&
    isDimension(cols[1]) &&
    isMetric(cols[2])

const isDimensionMetricMetric = (cols, strict = true) =>
    cols.length >= 3 &&
    isDimension(cols[0]) &&
    cols.slice(1).reduce((acc, col) => acc && isMetric(col), true)

const getChartTypeFromData = (cols, rows, strict = true) => {
    // this should take precendence for backwards compatibilty
    if (isDimensionMetricMetric(cols, strict)) {
        return DIMENSION_METRIC_METRIC;
    } else if (isDimensionDimensionMetric(cols, strict)) {
        let dataset = crossfilter(rows);
        let groups = [0,1].map(i => dataset.dimension(d => d[i]).group());
        let cardinalities = groups.map(group => group.size())
        if (Math.min(...cardinalities) < MAX_SERIES) {
            return DIMENSION_DIMENSION_METRIC;
        }
    } else if (isDimensionMetric(cols, strict)) {
        return DIMENSION_METRIC;
    }
    return null;
}

export default class LineAreaBarChart extends Component {
    static noHeader = true;
    static supportsSeries = true;

    static minSize = { width: 4, height: 3 };
    static settings = [ColorSetting()];

    static isSensible(cols, rows) {
        return getChartTypeFromData(cols, rows, false) != null;
    }

    static checkRenderable(cols, rows) {
        if (rows.length < 1) { throw new MinRowsError(1, rows.length); }
        if (getChartTypeFromData(cols, rows) == null) {
            throw new Error("We couldn’t create a " + this.noun + " based on your query.");
        }
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
        actionButtons: PropTypes.node,
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
        let nextState = {
            series: series,
            isMultiseries: false,
            isStacked: false
        };
        let s = series && series.length === 1 && series[0];
        if (s && s.data) {
            let type = getChartTypeFromData(s.data.cols, s.data.rows, false);
            if (type === DIMENSION_METRIC) {
                // no transform
            } else if (type === DIMENSION_DIMENSION_METRIC) {
                let dataset = crossfilter(s.data.rows);
                let groups = [0,1].map(i => dataset.dimension(d => d[i]).group());
                let cardinalities = groups.map(group => group.size())
                // initiall select the smaller cardinality dimension as the series dimension
                let [seriesDimensionIndex, axisDimensionIndex] = (cardinalities[0] > cardinalities[1]) ? [1,0] : [0,1];
                // if the series dimension is a date but the axis dimension is not then swap them
                if (isDate(s.data.cols[seriesDimensionIndex]) && !isDate(s.data.cols[axisDimensionIndex])) {
                    [seriesDimensionIndex, axisDimensionIndex] = [axisDimensionIndex, seriesDimensionIndex];
                }
                nextState.isMultiseries = true;
                nextState.series = groups[seriesDimensionIndex].reduce(
                    (p, v) => p.concat([[...v.slice(0, seriesDimensionIndex), ...v.slice(seriesDimensionIndex+1)]]),
                    (p, v) => null, () => []
                ).all().map(o => ({
                    card: { ...s.card, name: o.key, id: null },
                    data: {
                        rows: o.value,
                        cols: [...s.data.cols.slice(0,seriesDimensionIndex), ...s.data.cols.slice(seriesDimensionIndex+1)]
                    }
                }));
            } else if (type === DIMENSION_METRIC_METRIC) {
                nextState.isMultiseries = true;
                nextState.isStacked = true;
                nextState.series = s.data.cols.slice(1).map((col, index) => ({
                    card: { ...s.card, name: col.display_name || col.name, id: null },
                    data: {
                        rows: s.data.rows.map(row => [row[0], row[index + 1]]),
                        cols: [s.data.cols[0], s.data.cols[index + 1]]
                    }
                }));
            }
        }
        this.setState(nextState);
    }

    getHoverClasses() {
        const { hovered } = this.props;
        if (hovered && hovered.index != null) {
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

    getFidelity() {
        let fidelity = { x: 0, y: 0 };
        let size = this.props.gridSize ||  { width: Infinity, height: Infinity };
        if (size.width >= 5) {
            fidelity.x = 2;
        } else if (size.width >= 4) {
            fidelity.x = 1;
        }
        if (size.height >= 5) {
            fidelity.y = 2;
        } else if (size.height >= 4) {
            fidelity.y = 1;
        }

        return fidelity;
    }

    getSettings() {
        let fidelity = this.getFidelity();

        let settings = this.props.series[0].card.visualization_settings;

        // no axis in < 1 fidelity
        if (fidelity.x < 1) {
            settings = i.assocIn(settings, ["yAxis", "axis_enabled"], false);
        }
        if (fidelity.y < 1) {
            settings = i.assocIn(settings, ["xAxis", "axis_enabled"], false);
        }

        // no labels in < 2 fidelity
        if (fidelity.x < 2) {
            settings = i.assocIn(settings, ["yAxis", "labels_enabled"], false);
        }
        if (fidelity.y < 2) {
            settings = i.assocIn(settings, ["xAxis", "labels_enabled"], false);
        }

        // smooth interpolation at smallest x/y fidelity
        if (fidelity.x === 0 && fidelity.y === 0) {
            settings = i.assocIn(settings, ["line", "interpolate"], "cardinal");
        }

        return settings;
    }

    render() {
        const { hovered, isDashboard, onAddSeries, onRemoveSeries, actionButtons, allowSplitAxis } = this.props;
        const { series, isMultiseries, isStacked } = this.state;

        const card = this.props.series[0].card;
        const chartType = this.constructor.identifier;

        let settings = this.getSettings();

        return (
            <div className={cx("flex flex-column p1", this.getHoverClasses(), this.props.className)}>
                { (isDashboard && isMultiseries) &&
                    <a href={card.id && Urls.card(card.id)} className="Card-title pt1 px1 flex-no-shrink no-decoration h3 text-bold fullscreen-night-text fullscreen-normal-text" style={{fontSize: '1em'}}>{card.name}</a>
                }
                { (isDashboard || isMultiseries) &&
                    <LegendHeader
                        className="flex-no-shrink"
                        series={series}
                        onAddSeries={isMultiseries ? undefined : onAddSeries}
                        onRemoveSeries={onRemoveSeries}
                        actionButtons={actionButtons}
                        hovered={hovered}
                        onHoverChange={this.props.onHoverChange}
                    />
                }
                <CardRenderer
                    {...this.props}
                    chartType={chartType}
                    series={i.assocIn(series, [0, "card", "visualization_settings"], settings)}
                    className="flex-full"
                    allowSplitAxis={isMultiseries ? false : allowSplitAxis}
                    isStacked={isStacked}
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
