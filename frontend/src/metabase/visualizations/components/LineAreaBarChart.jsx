import React, { Component, PropTypes } from "react";

import CardRenderer from "./CardRenderer.jsx";
import LegendHeader from "./LegendHeader.jsx";
import ChartTooltip from "./ChartTooltip.jsx";

import lineAreaBarRenderer from "metabase/visualizations/lib/LineAreaBarRenderer";

import { isNumeric, isDate } from "metabase/lib/schema_metadata";
import {
    isSameSeries,
    getChartTypeFromData,
    getFriendlyName
} from "metabase/visualizations/lib/utils";

import { MinRowsError, ChartSettingsError } from "metabase/visualizations/lib/errors";

import crossfilter from "crossfilter";
import _ from "underscore";
import cx from "classnames";

export default class LineAreaBarChart extends Component {
    static noHeader = true;
    static supportsSeries = true;

    static minSize = { width: 4, height: 3 };

    static isSensible(cols, rows) {
        return getChartTypeFromData(cols, rows, false) != null;
    }

    static checkRenderable(cols, rows, settings) {
        if (rows.length < 1) { throw new MinRowsError(1, rows.length); }
        const dimensions = (settings["graph.dimensions"] || []).filter(name => name);
        const metrics = (settings["graph.metrics"] || []).filter(name => name);
        if (dimensions.length < 1 || metrics.length < 1) {
            throw new ChartSettingsError("Please select columns for the X and Y axis in the chart settings.", "Data");
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
        };
    }

    static propTypes = {
        series: PropTypes.array.isRequired,
        onAddSeries: PropTypes.func,
        actionButtons: PropTypes.node,
        isDashboard: PropTypes.bool
    };

    static defaultProps = {
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
        let { series, settings } = newProps;
        let nextState = {
            series: series,
        };
        let s = series && series.length === 1 && series[0];
        if (s && s.data) {
            const { cols, rows } = s.data;

            const dimensions = settings["graph.dimensions"].filter(d => d != null);
            const metrics = settings["graph.metrics"].filter(d => d != null);
            const dimensionIndexes = dimensions.map(dimensionName =>
                _.findIndex(cols, (col) => col.name === dimensionName)
            );
            const metricIndexes = metrics.map(metricName =>
                _.findIndex(cols, (col) => col.name === metricName)
            );

            const bubbleIndex = settings["scatter.bubble"] && _.findIndex(cols, (col) => col.name === settings["scatter.bubble"]);
            const extraIndexes = bubbleIndex && bubbleIndex >= 0 ? [bubbleIndex] : [];

            if (dimensions.length > 1) {
                const dataset = crossfilter(rows);
                const [dimensionIndex, seriesIndex] = dimensionIndexes;
                const rowIndexes = [dimensionIndex].concat(metricIndexes, extraIndexes);
                const seriesGroup = dataset.dimension(d => d[seriesIndex]).group()
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

                nextState.series = metricIndexes.map(metricIndex => {
                    const col = cols[metricIndex];
                    const rowIndexes = [dimensionIndex].concat(metricIndex, extraIndexes);
                    return {
                        card: {
                            ...s.card,
                            id: null,
                            name: getFriendlyName(col)
                        },
                        data: {
                            rows: rows.map(row =>
                                rowIndexes.map(i => row[i])
                            ),
                            cols: rowIndexes.map(i => s.data.cols[i])
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

        let settings = { ...this.props.settings };

        // no axis in < 1 fidelity
        if (fidelity.x < 1) {
            settings["graph.y_axis.axis_enabled"] = false;
        }
        if (fidelity.y < 1) {
            settings["graph.x_axis.axis_enabled"] = false;
        }

        // no labels in < 2 fidelity
        if (fidelity.x < 2) {
            settings["graph.y_axis.labels_enabled"] = false;
        }
        if (fidelity.y < 2) {
            settings["graph.x_axis.labels_enabled"] = false;
        }

        // smooth interpolation at smallest x/y fidelity
        if (fidelity.x === 0 && fidelity.y === 0) {
            settings["line.interpolate"] = "cardinal";
        }

        return settings;
    }

    render() {
        const { hovered, isDashboard, actionButtons } = this.props;
        const { series } = this.state;

        const settings = this.getSettings();

        const isMultiseries = this.state.series.length > 1;
        const isDashboardMultiseries = this.props.series.length > 1;
        const isCardMultiseries = isMultiseries && !isDashboardMultiseries;

        return (
            <div className={cx("flex flex-column p1", this.getHoverClasses(), this.props.className)}>
                {/* This is always used to show the original card titles/links + action buttons */}
                { isDashboard &&
                    <LegendHeader
                        className="flex-no-shrink"
                        series={this.props.series}
                        actionButtons={actionButtons}
                        hovered={hovered}
                        onHoverChange={this.props.onHoverChange}
                        settings={settings}
                    />
                }
                {/* This only shows transformed card multiseries titles */}
                { isCardMultiseries &&
                    <LegendHeader
                        className="flex-no-shrink"
                        series={series}
                        hovered={hovered}
                        onHoverChange={this.props.onHoverChange}
                        settings={settings}
                    />
                }
                <CardRenderer
                    {...this.props}
                    chartType={this.getChartType()}
                    series={series}
                    settings={settings}
                    className="flex-full"
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
