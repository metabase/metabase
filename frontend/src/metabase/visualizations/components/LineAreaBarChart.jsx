import React, { Component, PropTypes } from "react";

import CardRenderer from "./CardRenderer.jsx";
import LegendHeader from "./LegendHeader.jsx";
import ChartTooltip from "./ChartTooltip.jsx";

import lineAreaBarRenderer from "metabase/visualizations/lib/LineAreaBarRenderer";

import { isNumeric, isDate } from "metabase/lib/schema_metadata";
import {
    getChartTypeFromData,
    getFriendlyName
} from "metabase/visualizations/lib/utils";

import { getSettings } from "metabase/lib/visualization_settings";

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
        let initialSettings = getSettings([initialSeries]);
        let newSettings = getSettings([newSeries]);

        let initialDimensions = getColumnsFromNames(initialSeries.data.cols, initialSettings["graph.dimensions"]);
        let newDimensions = getColumnsFromNames(newSeries.data.cols, newSettings["graph.dimensions"]);
        let newMetrics = getColumnsFromNames(newSeries.data.cols, newSettings["graph.metrics"]);

        // must have at least one dimension and one metric
        if (newDimensions.length === 0 || newMetrics.length === 0) {
            return false;
        }

        // all metrics must be numeric
        if (!_.all(newMetrics, isNumeric)) {
            return false;
        }

        // both or neither primary dimension must be dates
        if (isDate(initialDimensions[0]) !== isDate(newDimensions[0])) {
            return false;
        }

        // both or neither primary dimension must be numeric
        if (isNumeric(initialDimensions[0]) !== isNumeric(newDimensions[0])) {
            return false;
        }

        return true;
    }

    static transformSeries(series) {
        let newSeries = [].concat(...series.map((s) => transformSingleSeries(s, series)));
        if (_.isEqual(series, newSeries) || newSeries.length === 0) {
            return series;
        } else {
            return newSeries;
        }
    }

    static propTypes = {
        series: PropTypes.array.isRequired,
        onAddSeries: PropTypes.func,
        actionButtons: PropTypes.node,
        isDashboard: PropTypes.bool
    };

    static defaultProps = {
    };

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
        const { series, hovered, isDashboard, actionButtons } = this.props;

        const settings = this.getSettings();

        let titleHeaderSeries, multiseriesHeaderSeries;

        let originalSeries = series._raw || series;
        let cardIds = _.uniq(originalSeries.map(s => s.card.id))

        if (isDashboard && settings["card.title"]) {
            titleHeaderSeries = [{ card: {
                name: settings["card.title"],
                id: cardIds.length === 1 ? cardIds[0] : null
            }}];
        }

        if (series.length > 1) {
            multiseriesHeaderSeries = series;
        }

        return (
            <div className={cx("flex flex-column p1", this.getHoverClasses(), this.props.className)}>
                { titleHeaderSeries ?
                    <LegendHeader
                        className="flex-no-shrink"
                        series={titleHeaderSeries}
                        actionButtons={actionButtons}
                    />
                : null }
                { multiseriesHeaderSeries || (!titleHeaderSeries && actionButtons) ? // always show action buttons if we have them
                    <LegendHeader
                        className="flex-no-shrink"
                        series={multiseriesHeaderSeries}
                        settings={settings}
                        hovered={hovered}
                        onHoverChange={this.props.onHoverChange}
                        actionButtons={!titleHeaderSeries ? actionButtons : null}
                    />
                : null }
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

function getColumnsFromNames(cols, names) {
    if (!names) {
        return [];
    }
    return names.map(name => _.findWhere(cols, { name }));
}

function transformSingleSeries(s, series) {
    const { card, data } = s;

    // HACK: prevents cards from being transformed too many times
    if (card._transformed) {
        return [s];
    }

    const { cols, rows } = data;
    const settings = getSettings([s]);

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
        return seriesGroup.reduce(
            (p, v) => p.concat([rowIndexes.map(i => v[i])]),
            (p, v) => null, () => []
        ).all().map(o => ({
            card: {
                ...card,
                // if multiseries include the card title as well as the breakout value
                name: [
                    // show series title if it's multiseries
                    series.length > 1 && card.name,
                    // always show grouping value
                    o.key
                ].filter(n => n).join(": "),
                _transformed: true,
            },
            data: {
                rows: o.value,
                cols: rowIndexes.map(i => cols[i])
            }
        }));
    } else {
        const dimensionIndex = dimensionIndexes[0];
        return metricIndexes.map(metricIndex => {
            const col = cols[metricIndex];
            const rowIndexes = [dimensionIndex].concat(metricIndex, extraIndexes);
            return {
                card: {
                    ...card,
                    name: [
                        // show series title if it's multiseries
                        series.length > 1 && card.name,
                        // show column name if there are multiple metrics
                        metricIndexes.length > 1 && getFriendlyName(col)
                    ].filter(n => n).join(": "),
                    _transformed: true,
                },
                data: {
                    rows: rows.map(row =>
                        rowIndexes.map(i => row[i])
                    ),
                    cols: rowIndexes.map(i => cols[i])
                }
            };
        });
    }
}
