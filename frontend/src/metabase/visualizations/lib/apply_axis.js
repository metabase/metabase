/// functions for "applying" axes to charts, whatever that means.

import _ from "underscore";
import d3 from "d3";
import dc from "dc";
import moment from "moment";

import { datasetContainsNoResults } from "metabase/lib/dataset";
import { formatValue } from "metabase/lib/formatting";
import { parseTimestamp } from "metabase/lib/time";

import { computeTimeseriesTicksInterval } from "./timeseries";
import { getFriendlyName } from "./utils";

const MIN_PIXELS_PER_TICK = { x: 100, y: 32 };

// label offset (doesn't increase padding)
const X_LABEL_PADDING = 10;
const Y_LABEL_PADDING = 22;

function adjustTicksIfNeeded(axis, axisSize: number, minPixelsPerTick: number) {
    const ticks = axis.ticks();
    // d3.js is dumb and sometimes numTicks is a number like 10 and other times it is an Array like [10]
    // if it's an array then convert to a num
    const numTicks: number = Array.isArray(ticks) ? ticks[0] : ticks;

    if ((axisSize / numTicks) < minPixelsPerTick) {
        axis.ticks(Math.round(axisSize / minPixelsPerTick));
    }
}

export function applyChartTimeseriesXAxis(chart, settings, series, { xValues, xDomain, xInterval }) {
    // find the first nonempty single series
    // $FlowFixMe
    const firstSeries: SingleSeries = _.find(series, (s) => !datasetContainsNoResults(s.data));

    // setup an x-axis where the dimension is a timeseries
    let dimensionColumn = firstSeries.data.cols[0];

    // get the data's timezone offset from the first row
    let dataOffset = parseTimestamp(firstSeries.data.rows[0][0]).utcOffset() / 60;

    // compute the data interval
    let dataInterval = xInterval;
    let tickInterval = dataInterval;

    if (settings["graph.x_axis.labels_enabled"]) {
        chart.xAxisLabel(settings["graph.x_axis.title_text"] || getFriendlyName(dimensionColumn), X_LABEL_PADDING);
    }
    if (settings["graph.x_axis.axis_enabled"]) {
        chart.renderVerticalGridLines(settings["graph.x_axis.gridLine_enabled"]);

        if (dimensionColumn.unit == null) {
            dimensionColumn = { ...dimensionColumn, unit: dataInterval.interval };
        }

        // special handling for weeks
        // TODO: are there any other cases where we should do this?
        if (dataInterval.interval === "week") {
            // if tick interval is compressed then show months instead of weeks because they're nicer formatted
            const newTickInterval = computeTimeseriesTicksInterval(xDomain, tickInterval, chart.width(), MIN_PIXELS_PER_TICK.x);
            if (newTickInterval.interval !== tickInterval.interval || newTickInterval.count !== tickInterval.count) {
                dimensionColumn = { ...dimensionColumn, unit: "month" },
                tickInterval = { interval: "month", count: 1 };
            }
        }

        chart.xAxis().tickFormat(timestamp => {
            // timestamp is a plain Date object which discards the timezone,
            // so add it back in so it's formatted correctly
            const timestampFixed = moment(timestamp).utcOffset(dataOffset).format();
            return formatValue(timestampFixed, { column: dimensionColumn, type: "axis" })
        });

        // Compute a sane interval to display based on the data granularity, domain, and chart width
        tickInterval = computeTimeseriesTicksInterval(xDomain, tickInterval, chart.width(), MIN_PIXELS_PER_TICK.x);
        chart.xAxis().ticks(d3.time[tickInterval.interval], tickInterval.count);
    } else {
        chart.xAxis().ticks(0);
    }

    // pad the domain slightly to prevent clipping
    xDomain[0] = moment(xDomain[0]).subtract(dataInterval.count * 0.75, dataInterval.interval);
    xDomain[1] = moment(xDomain[1]).add(dataInterval.count * 0.75, dataInterval.interval);

    // set the x scale
    chart.x(d3.time.scale.utc().domain(xDomain));//.nice(d3.time[dataInterval.interval]));

    // set the x units (used to compute bar size)
    chart.xUnits((start, stop) => Math.ceil(1 + moment(stop).diff(start, dataInterval.interval) / dataInterval.count));
}

export function applyChartQuantitativeXAxis(chart, settings, series, { xValues, xDomain, xInterval }) {
    // find the first nonempty single series
    // $FlowFixMe
    const firstSeries: SingleSeries = _.find(series, (s) => !datasetContainsNoResults(s.data));
    const dimensionColumn = firstSeries.data.cols[0];

    if (settings["graph.x_axis.labels_enabled"]) {
        chart.xAxisLabel(settings["graph.x_axis.title_text"] || getFriendlyName(dimensionColumn), X_LABEL_PADDING);
    }
    if (settings["graph.x_axis.axis_enabled"]) {
        chart.renderVerticalGridLines(settings["graph.x_axis.gridLine_enabled"]);
        adjustTicksIfNeeded(chart.xAxis(), chart.width(), MIN_PIXELS_PER_TICK.x);

        chart.xAxis().tickFormat(d => formatValue(d, { column: dimensionColumn }));
    } else {
        chart.xAxis().ticks(0);
        chart.xAxis().tickFormat('');
    }

    let scale;
    if (settings["graph.x_axis.scale"] === "pow") {
        scale = d3.scale.pow().exponent(0.5);
    } else if (settings["graph.x_axis.scale"] === "log") {
        scale = d3.scale.log().base(Math.E);
        if (!((xDomain[0] < 0 && xDomain[1] < 0) || (xDomain[0] > 0 && xDomain[1] > 0))) {
            throw "X-axis must not cross 0 when using log scale.";
        }
    } else {
        scale = d3.scale.linear();
    }

    // pad the domain slightly to prevent clipping
    xDomain = [
        xDomain[0] - xInterval * 0.75,
        xDomain[1] + xInterval * 0.75
    ];

    chart.x(scale.domain(xDomain))
         .xUnits(dc.units.fp.precision(xInterval));
}

export function applyChartOrdinalXAxis(chart, settings, series, { xValues }) {
    // find the first nonempty single series
    // $FlowFixMe
    const firstSeries: SingleSeries = _.find(series, (s) => !datasetContainsNoResults(s.data));

    const dimensionColumn = firstSeries.data.cols[0];

    if (settings["graph.x_axis.labels_enabled"]) {
        chart.xAxisLabel(settings["graph.x_axis.title_text"] || getFriendlyName(dimensionColumn), X_LABEL_PADDING);
    }
    if (settings["graph.x_axis.axis_enabled"]) {
        chart.renderVerticalGridLines(settings["graph.x_axis.gridLine_enabled"]);
        chart.xAxis().ticks(xValues.length);
        adjustTicksIfNeeded(chart.xAxis(), chart.width(), MIN_PIXELS_PER_TICK.x);

        // unfortunately with ordinal axis you can't rely on xAxis.ticks(num) to control the display of labels
        // so instead if we want to display fewer ticks than our full set we need to calculate visibleTicks()
        let numTicks = chart.xAxis().ticks();
        if (Array.isArray(numTicks)) {
            numTicks = numTicks[0];
        }
        if (numTicks < xValues.length) {
            let keyInterval = Math.round(xValues.length / numTicks);
            let visibleKeys = xValues.filter((v, i) => i % keyInterval === 0);
            chart.xAxis().tickValues(visibleKeys);
        }
        chart.xAxis().tickFormat(d => formatValue(d, { column: dimensionColumn }));
    } else {
        chart.xAxis().ticks(0);
        chart.xAxis().tickFormat('');
    }

    chart.x(d3.scale.ordinal().domain(xValues))
         .xUnits(dc.units.ordinal);
}

export function applyChartYAxis(chart, settings, series, yExtent, axisName) {
    let axis;
    if (axisName !== "right") {
        axis = {
            scale:   (...args) => chart.y(...args),
            axis:    (...args) => chart.yAxis(...args),
            label:   (...args) => chart.yAxisLabel(...args),
            setting: (name) => settings["graph.y_axis." + name]
        };
    } else {
        axis = {
            scale:   (...args) => chart.rightY(...args),
            axis:    (...args) => chart.rightYAxis(...args),
            label:   (...args) => chart.rightYAxisLabel(...args),
            setting: (name) => settings["graph.y_axis." + name] // TODO: right axis settings
        };
    }

    if (axis.setting("labels_enabled")) {
        // left
        if (axis.setting("title_text")) {
            axis.label(axis.setting("title_text"), Y_LABEL_PADDING);
        } else {
            // only use the column name if all in the series are the same
            const labels = _.uniq(series.map(s => getFriendlyName(s.data.cols[1])));
            if (labels.length === 1) {
                axis.label(labels[0], Y_LABEL_PADDING);
            }
        }
    }

    if (axis.setting("axis_enabled")) {
        // special case for normalized stacked charts
        // for normalized stacked charts the y-axis is a percentage number. In Javascript, 0.07 * 100.0 = 7.000000000000001 (try it) so we
        // round that number to get something nice like "7". Then we append "%" to get a nice tick like "7%"
        if (settings["stackable.stack_type"] === "normalized") {
            axis.axis().tickFormat(value => Math.round(value * 100) + "%");
        }
        chart.renderHorizontalGridLines(true);
        adjustTicksIfNeeded(axis.axis(), chart.height(), MIN_PIXELS_PER_TICK.y);
    } else {
        axis.axis().ticks(0);
    }

    let scale;
    if (axis.setting("scale") === "pow") {
        scale = d3.scale.pow().exponent(0.5);
    } else if (axis.setting("scale") === "log") {
        scale = d3.scale.log().base(Math.E);
        // axis.axis().tickFormat((d) => scale.tickFormat(4,d3.format(",d"))(d));
    } else {
        scale = d3.scale.linear();
    }

    if (axis.setting("auto_range")) {
        // elasticY not compatible with log scale
        if (axis.setting("scale") !== "log") {
            // TODO: right axis?
            chart.elasticY(true);
        } else {
            if (!((yExtent[0] < 0 && yExtent[1] < 0) || (yExtent[0] > 0 && yExtent[1] > 0))) {
                throw "Y-axis must not cross 0 when using log scale.";
            }
            scale.domain(yExtent);
        }
        axis.scale(scale);
    } else {
        if (axis.setting("scale") === "log" && !(
            (axis.setting("min") < 0 && axis.setting("max") < 0) ||
            (axis.setting("min") > 0 && axis.setting("max") > 0)
        )) {
            throw "Y-axis must not cross 0 when using log scale.";
        }
        axis.scale(scale.domain([axis.setting("min"), axis.setting("max")]))
    }
}
