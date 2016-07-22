import React, { Component, PropTypes } from "react";

import CardRenderer from "./CardRenderer.jsx";
import LegendHeader from "./LegendHeader.jsx";
import ChartTooltip from "./ChartTooltip.jsx";

import lineAreaBarRenderer from "metabase/visualizations/lib/LineAreaBarRenderer";

import { isNumeric, isDate } from "metabase/lib/schema_metadata";
import {
    isSameSeries,
    getChartTypeFromData
} from "metabase/visualizations/lib/utils";

import Urls from "metabase/lib/urls";

import { MinRowsError } from "metabase/visualizations/lib/errors";

import crossfilter from "crossfilter";
import _ from "underscore";
import cx from "classnames";
import i from "icepick";

export default class LineAreaBarChart extends Component {
    static noHeader = true;
    static supportsSeries = true;

    static minSize = { width: 4, height: 3 };

    static isSensible(cols, rows) {
        return getChartTypeFromData(cols, rows, false) != null;
    }

    static checkRenderable(cols, rows, settings) {
        if (rows.length < 1) { throw new MinRowsError(1, rows.length); }
        const dimensions = settings["graph.dimensions"] || [];
        const metrics = settings["graph.metrics"] || [];
        if (dimensions.length < 1 || metrics.length < 1) {
            throw new Error("Please select columns for the X and Y axis in the chart settings.");
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
            const { cols, rows } = s.data;

            const dimensions = newProps.settings["graph.dimensions"].filter(d => d != null);
            const metrics = newProps.settings["graph.metrics"].filter(d => d != null);
            const dimensionIndexes = dimensions.map(dimensionName =>
                _.findIndex(cols, (col) => col.name === dimensionName)
            );
            const metricIndexes = metrics.map(metricName =>
                _.findIndex(cols, (col) => col.name === metricName)
            );

            if (dimensions.length > 1) {
                const dataset = crossfilter(rows);
                const [dimensionIndex, seriesIndex] = dimensionIndexes;
                const rowIndexes = [dimensionIndex].concat(metricIndexes);
                const seriesGroup = dataset.dimension(d => d[seriesIndex]).group()

                nextState.isMultiseries = true;
                nextState.series = seriesGroup.reduce(
                    (p, v) => p.concat([rowIndexes.map(i => v[i])]),
                    (p, v) => null, () => []
                ).all().map(o => ({
                    card: {
                        ...s.card,
                        id: null,
                        name: o.key
                    },
                    data: {
                        rows: o.value,
                        cols: rowIndexes.map(i => s.data.cols[i])
                    }
                }));
            } else {
                const dimensionIndex = dimensionIndexes[0];

                nextState.isMultiseries = true;
                nextState.isStacked = true;
                nextState.series = metrics.map((col, index) => {
                    let metricIndex = metricIndexes[index];
                    return {
                        card: {
                            ...s.card,
                            id: null,
                            name: col.display_name || col.name
                        },
                        data: {
                            rows: rows.map(row => [row[dimensionIndex], row[metricIndex]]),
                            cols: [cols[dimensionIndex], s.data.cols[metricIndex]]
                        }
                    };
                });
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

    getChartType() {
        return this.constructor.identifier;
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

        let settings = this.props.settings;

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
                        settings={settings}
                    />
                }
                <CardRenderer
                    {...this.props}
                    chartType={this.getChartType()}
                    series={i.assocIn(series, [0, "card", "visualization_settings"], settings)}
                    className="flex-full"
                    allowSplitAxis={isMultiseries ? false : allowSplitAxis}
                    isStacked={isStacked}
                    renderer={lineAreaBarRenderer}
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
