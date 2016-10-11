import crossfilter from "crossfilter";
import d3 from "d3";
import dc from "dc";
import moment from "moment";
import _ from "underscore";

import {
    getAvailableCanvasWidth,
    getAvailableCanvasHeight,
    computeSplit,
    getFriendlyName,
    getXValues
} from "./utils";

import {
    dimensionIsTimeseries,
    minTimeseriesUnit,
    computeTimeseriesDataInverval,
    computeTimeseriesTicksInterval
} from "./timeseries";

import {
    dimensionIsNumeric,
    computeNumericDataInverval
} from "./numeric";

import { determineSeriesIndexFromElement } from "./tooltip";

import { colorShades } from "./utils";

import { formatValue } from "metabase/lib/formatting";
import { parseTimestamp } from "metabase/lib/time";

const MIN_PIXELS_PER_TICK = { x: 100, y: 32 };
const BAR_PADDING_RATIO = 0.2;
const DEFAULT_INTERPOLATION = "linear";

const DOT_OVERLAP_COUNT_LIMIT = 8;
const DOT_OVERLAP_RATIO = 0.10;
const DOT_OVERLAP_DISTANCE = 8;

const VORONOI_TARGET_RADIUS = 50;
const VORONOI_MAX_POINTS = 300;

function adjustTicksIfNeeded(axis, axisSize, minPixelsPerTick) {
    let numTicks = axis.ticks();
    // d3.js is dumb and sometimes numTicks is a number like 10 and other times it is an Array like [10]
    // if it's an array then convert to a num
    numTicks = numTicks.length != null ? numTicks[0] : numTicks;

    if ((axisSize / numTicks) < minPixelsPerTick) {
        axis.ticks(Math.round(axisSize / minPixelsPerTick));
    }
}

function getDcjsChartType(cardType) {
    switch (cardType) {
        case "line": return "lineChart";
        case "area": return "lineChart";
        case "bar":     return "barChart";
        case "scatter": return "bubbleChart";
        default:     return "barChart";
    }
}

function applyChartBoundary(chart, element) {
    return chart
        .width(getAvailableCanvasWidth(element))
        .height(getAvailableCanvasHeight(element));
}

function applyChartTimeseriesXAxis(chart, settings, series, xValues, xDomain, xInterval) {
    // setup an x-axis where the dimension is a timeseries
    let dimensionColumn = series[0].data.cols[0];

    // get the data's timezone offset from the first row
    let dataOffset = parseTimestamp(series[0].data.rows[0][0]).utcOffset() / 60;

    // compute the data interval
    let dataInterval = xInterval;
    let tickInterval = dataInterval;

    if (settings["graph.x_axis.labels_enabled"]) {
        chart.xAxisLabel(settings["graph.x_axis.title_text"] || getFriendlyName(dimensionColumn));
    }
    if (settings["graph.x_axis.axis_enabled"]) {
        chart.renderVerticalGridLines(settings["graph.x_axis.gridLine_enabled"]);

        if (dimensionColumn.unit == null) {
            dimensionColumn = { ...dimensionColumn, unit: dataInterval.interval };
        }

        chart.xAxis().tickFormat(timestamp => {
            // timestamp is a plain Date object which discards the timezone,
            // so add it back in so it's formatted correctly
            const timestampFixed = moment(timestamp).utcOffset(dataOffset).format();
            return formatValue(timestampFixed, { column: dimensionColumn })
        });

        // Compute a sane interval to display based on the data granularity, domain, and chart width
        tickInterval = computeTimeseriesTicksInterval(xDomain, dataInterval, chart.width(), MIN_PIXELS_PER_TICK.x, );
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

function applyChartQuantitativeXAxis(chart, settings, series, xValues, xDomain, xInterval) {
    const dimensionColumn = series[0].data.cols[0];

    if (settings["graph.x_axis.labels_enabled"]) {
        chart.xAxisLabel(settings["graph.x_axis.title_text"] || getFriendlyName(dimensionColumn));
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

function applyChartOrdinalXAxis(chart, settings, series, xValues) {
    const dimensionColumn = series[0].data.cols[0];

    if (settings["graph.x_axis.labels_enabled"]) {
        chart.xAxisLabel(settings["graph.x_axis.title_text"] || getFriendlyName(dimensionColumn));
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

function applyChartYAxis(chart, settings, series, yExtent, axisName) {
    let axis;
    if (axisName === "left") {
        axis = {
            scale:   (...args) => chart.y(...args),
            axis:    (...args) => chart.yAxis(...args),
            label:   (...args) => chart.yAxisLabel(...args),
            setting: (name) => settings["graph.y_axis." + name]
        };
    } else if (axisName === "right") {
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
            axis.label(axis.setting("title_text"));
        } else {
            // only use the column name if all in the series are the same
            const labels = _.uniq(series.map(s => getFriendlyName(s.data.cols[1])));
            if (labels.length === 1) {
                axis.label(labels[0]);
            }
        }
    }

    if (axis.setting("axis_enabled")) {
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

function applyChartTooltips(chart, series, onHoverChange) {
    let [{ data: { cols } }] = series;
    chart.on("renderlet.tooltips", function(chart) {
        chart.selectAll(".bar, .dot, .area, .line, .bubble, g.pie-slice, g.features")
            .on("mousemove", function(d, i) {
                const isSingleSeriesBar = this.classList.contains("bar") && series.length === 1;

                let data;
                if (Array.isArray(d.key)) { // scatter
                    data = d.key.map((value, index) => (
                        { key: getFriendlyName(cols[index]), value: value, col: cols[index] }
                    ));
                } else if (d.data) { // line, area, bar
                    data = [
                        { key: getFriendlyName(cols[0]), value: d.data.key, col: cols[0] },
                        { key: getFriendlyName(cols[1]), value: d.data.value, col: cols[1] }
                    ];
                }

                onHoverChange && onHoverChange({
                    // for single series bar charts, fade the series and highlght the hovered element with CSS
                    index: isSingleSeriesBar ? -1 : determineSeriesIndexFromElement(this),
                    element: this,
                    d: d,
                    data: data && _.uniq(data, (d) => d.col)
                });
            })
            .on("mouseleave", function() {
                onHoverChange && onHoverChange(null);
            });

        chart.selectAll("title").remove();
    });
}

function applyChartLineBarSettings(chart, settings, chartType) {
    // if the chart supports 'brushing' (brush-based range filter), disable this since it intercepts mouse hovers which means we can't see tooltips
    if (chart.brushOn) {
        chart.brushOn(false);
    }

    // LINE/AREA:
    // for chart types that have an 'interpolate' option (line/area charts), enable based on settings
    if (chart.interpolate) {
        if (settings["line.interpolate"]) {
            chart.interpolate(settings["line.interpolate"]);
        } else {
            chart.interpolate(DEFAULT_INTERPOLATION);
        }
    }

    // AREA:
    if (chart.renderArea) {
        chart.renderArea(chartType === "area");
    }

    // BAR:
    if (chart.barPadding) {
        chart
            .barPadding(BAR_PADDING_RATIO)
            .centerBar(settings["graph.x_axis.scale"] !== "ordinal");
    }
}

function lineAndBarOnRender(chart, settings, onGoalHover, isSplitAxis) {
    // once chart has rendered and we can access the SVG, do customizations to axis labels / etc that you can't do through dc.js

    function removeClipPath() {
        for (let elem of chart.selectAll(".sub, .chart-body")[0]) {
            // prevents dots from being clipped:
            elem.removeAttribute("clip-path");
        }
    }

    function moveContentToTop() {
        for (let elem of chart.selectAll(".sub, .chart-body")[0]) {
            // move chart content on top of axis (z-index doesn't work on SVG):
            elem.parentNode.appendChild(elem);
        }
    }

    function setDotStyle() {
        for (let elem of chart.svg().selectAll('.dc-tooltip circle.dot')[0]) {
            // set the color of the dots to the fill color so we can use currentColor in CSS rules:
            elem.style.color = elem.getAttribute("fill");
        }
    }

    function enableDots() {
        let enableDots;
        const dots = chart.svg().selectAll(".dc-tooltip .dot")[0];
        if (settings["line.marker_enabled"] != null) {
            enableDots = !!settings["line.marker_enabled"];
        } else if (dots.length > 500) {
            // more than 500 dots is almost certainly too dense, don't waste time computing the voronoi map
            enableDots = false;
        } else {
            const vertices = dots.map((e, index) => {
                let rect = e.getBoundingClientRect();
                return [rect.left, rect.top, index];
            });
            const overlappedIndex = {};
            // essentially pairs of vertices closest to each other
            for (let { source, target } of d3.geom.voronoi().links(vertices)) {
                if (Math.sqrt(Math.pow(source[0] - target[0], 2) + Math.pow(source[1] - target[1], 2)) < DOT_OVERLAP_DISTANCE) {
                    // if they overlap, mark both as overlapped
                    overlappedIndex[source[2]] = overlappedIndex[target[2]] = true;
                }
            }
            const total = vertices.length;
            const overlapping = Object.keys(overlappedIndex).length;
            enableDots = overlapping < DOT_OVERLAP_COUNT_LIMIT || (overlapping / total) < DOT_OVERLAP_RATIO;
        }
        chart.svg()
            .classed("enable-dots", enableDots)
            .classed("enable-dots-onhover", !enableDots);
    }

    function voronoiHover() {
        const parent = chart.svg().select("svg > g");
        const dots = chart.svg().selectAll(".sub .dc-tooltip .dot")[0];

        if (dots.length === 0 || dots.length > VORONOI_MAX_POINTS) {
            return;
        }

        const originRect = chart.svg().node().getBoundingClientRect();
        const vertices = dots.map(e => {
            let { top, left, width, height } = e.getBoundingClientRect();
            let px = (left + width / 2) - originRect.left;
            let py = (top + height / 2) - originRect.top;
            return [px, py, e];
        });

        const { width, height } = parent.node().getBBox();
        const voronoi = d3.geom.voronoi()
            .clipExtent([[0,0], [width, height]]);

        // circular clip paths to limit distance from actual point
        parent.append("svg:g")
            .selectAll("clipPath")
                .data(vertices)
            .enter().append("svg:clipPath")
                .attr("id", (d, i) => "clip-" + i)
            .append("svg:circle")
                .attr('cx', (d) => d[0])
                .attr('cy', (d) => d[1])
                .attr('r', VORONOI_TARGET_RADIUS);

        // voronoi layout with clip paths applied
        parent.append("svg:g")
                .classed("voronoi", true)
            .selectAll("path")
                .data(voronoi(vertices), (d) => d&&d.join(","))
                .enter().append("svg:path")
                    .filter((d) => d != undefined)
                    .attr("d", (d) => "M" + d.join("L") + "Z")
                    .attr("clip-path", (d,i) => "url(#clip-"+i+")")
                    .on("mousemove", ({ point }) => {
                        let e = point[2];
                        dispatchUIEvent(e, "mousemove");
                        d3.select(e).classed("hover", true);
                    })
                    .on("mouseleave", ({ point }) => {
                        let e = point[2];
                        dispatchUIEvent(e, "mouseleave");
                        d3.select(e).classed("hover", false);
                    })
                .order();

        function dispatchUIEvent(element, eventName) {
            let e = document.createEvent("UIEvents");
            e.initUIEvent(eventName, true, true, window, 1);
            element.dispatchEvent(e);
        }
    }

    function hideDisabledLabels() {
       if (!settings["graph.x_axis.labels_enabled"]) {
           chart.selectAll(".x-axis-label").remove();
       }
       if (!settings["graph.y_axis.labels_enabled"]) {
           chart.selectAll(".y-axis-label").remove();
       }
    }

    function hideDisabledAxis() {
       if (!settings["graph.x_axis.axis_enabled"]) {
           chart.selectAll(".axis.x").remove();
       }
       if (!settings["graph.y_axis.axis_enabled"]) {
           chart.selectAll(".axis.y, .axis.yr").remove();
       }
    }

    function hideBadAxis() {
        if (chart.selectAll(".axis.x .tick")[0].length === 1) {
            chart.selectAll(".axis.x").remove();
        }
    }

    function adjustMargin(margin, direction, axisSelector, labelSelector, enabled) {
        let axis = chart.select(axisSelector).node();
        let label = chart.select(labelSelector).node();
        let axisSize = axis ? axis.getBoundingClientRect()[direction] + 10 : 0;
        let labelSize = label ? label.getBoundingClientRect()[direction] + 5 : 0;
        chart.margins()[margin] = axisSize + labelSize;
    }

    function computeMinHorizontalMargins() {
        let min = { left: 0, right: 0 };
        let ticks = chart.selectAll(".axis.x .tick text")[0];
        if (ticks.length > 0) {
            let chartRect = chart.select("svg").node().getBoundingClientRect();
            min.left = chart.margins().left - (ticks[0].getBoundingClientRect().left - chartRect.left);
            min.right = chart.margins().right - (chartRect.right - ticks[ticks.length - 1].getBoundingClientRect().right);
        }
        return min;
    }

    function disableClickFiltering() {
        chart.selectAll("rect.bar")
            .style({ cursor: "inherit" })
            .on("click", (d) => {
                chart.filter(null);
                chart.filter(d.key);
            });
    }

    function fixStackZIndex() {
        // reverse the order of .stack-list and .dc-tooltip-list children so 0 points in stacked
        // charts don't appear on top of non-zero points
        for (const list of chart.selectAll(".stack-list, .dc-tooltip-list")[0]) {
            for (const child of list.childNodes) {
                list.insertBefore(list.firstChild, child);
            }
        }
    }

    function cleanupGoal() {
        // remove dots
        chart.selectAll(".goal .dot").remove();

        // move to end of the parent node so it's on top
        chart.selectAll(".goal").each(function() { this.parentNode.appendChild(this); });
        chart.selectAll(".goal .line").attr({
            "stroke": "rgba(157,160,164, 0.7)",
            "stroke-dasharray": "5,5"
        });

        // add the label
        let goalLine = chart.selectAll(".goal .line")[0][0];
        if (goalLine) {

            // stretch the goal line all the way across, use x axis as reference
            let xAxisLine = chart.selectAll(".axis.x .domain")[0][0];
            if (xAxisLine) {
                goalLine.setAttribute("d", `M0,${goalLine.getBBox().y}L${xAxisLine.getBBox().width},${goalLine.getBBox().y}`)
            }

            let { x, y, width } = goalLine.getBBox();

            const labelOnRight = !isSplitAxis;
            chart.selectAll(".goal .stack._0")
                .append("text")
                .text("Goal")
                .attr({
                    x: labelOnRight ? x + width : x,
                    y: y - 5,
                    "text-anchor": labelOnRight ? "end" : "start",
                    "font-weight": "bold",
                    fill: "rgb(157,160,164)",
                })
                .on("mouseenter", function() { onGoalHover(this); })
                .on("mouseleave", function() { onGoalHover(null); })
        }
    }

    // run these first so the rest of the margin computations take it into account
    hideDisabledLabels();
    hideDisabledAxis();
    hideBadAxis();

    // should be run before adjusting margins
    let mins = computeMinHorizontalMargins()

    // adjust the margins to fit the X and Y axis tick and label sizes, if enabled
    adjustMargin("bottom", "height", ".axis.x",  ".x-axis-label", settings["graph.x_axis.labels_enabled"]);
    adjustMargin("left",   "width",  ".axis.y",  ".y-axis-label.y-label", settings["graph.y_axis.labels_enabled"]);
    adjustMargin("right",  "width",  ".axis.yr", ".y-axis-label.yr-label", settings["graph.y_axis.labels_enabled"]);

    // set margins to the max of the various mins
    chart.margins().left = Math.max(5, mins.left, chart.margins().left);
    chart.margins().right = Math.max(5, mins.right, chart.margins().right);
    chart.margins().bottom = Math.max(10, chart.margins().bottom);

    chart.on("renderlet.on-render", function() {
        removeClipPath();
        moveContentToTop();
        setDotStyle();
        enableDots();
        voronoiHover();
        cleanupGoal(); // do this before hiding x-axis
        hideDisabledLabels();
        hideDisabledAxis();
        hideBadAxis();
        disableClickFiltering();
        fixStackZIndex();
    });

    chart.render();
}

function reduceGroup(group, key) {
    return group.reduce(
        (acc, d) => (acc == null && d[key] == null) ? null : (acc || 0) + (d[key] || 0),
        (acc, d) => (acc == null && d[key] == null) ? null : (acc || 0) - (d[key] || 0),
        () => null
    );
}

function fillMissingValues(datas, xValues, fillValue, getKey = (v) => v) {
    try {
        return datas.map(rows => {
            const fillValues = rows[0].slice(1).map(d => fillValue);

            let map = new Map();
            for (const row of rows) {
                map.set(getKey(row[0]), row);
            }
            let newRows = xValues.map(value => {
                const key = getKey(value);
                const row = map.get(key);
                if (row) {
                    map.delete(key);
                    return [value, ...row.slice(1)];
                } else {
                    return [value, ...fillValues];
                }
            });
            if (map.size > 0) {
                console.warn("xValues missing!", map, newRows)
            }
            return newRows;
        });
    } catch (e) {
        console.warn(e);
        return datas;
    }
}

// Crossfilter calls toString on each moment object, which calls format(), which is very slow.
// Replace toString with a function that just returns the unparsed ISO input date, since that works
// just as well and is much faster
let HACK_parseTimestamp = (value, unit) => {
    let m = parseTimestamp(value, unit);
    m.toString = moment_fast_toString
    return m;
}

function moment_fast_toString() {
    return this._i;
}

export default function lineAreaBar(element, { series, onHoverChange, onRender, chartType, isScalarSeries, settings }) {
    const colors = settings["graph.colors"];

    const isTimeseries = settings["graph.x_axis.scale"] === "timeseries";
    const isQuantitative = ["linear", "log", "pow"].indexOf(settings["graph.x_axis.scale"]) >= 0;

    const isDimensionTimeseries = dimensionIsTimeseries(series[0].data);
    const isDimensionNumeric = dimensionIsNumeric(series[0].data);

    if (series[0].data.cols.length < 2) {
        throw "This chart type requires at least 2 columns";
    }

    if (series.length > 20) {
        throw "This chart type doesn't support more than 20 series";
    }

    let datas = series.map((s, index) =>
        s.data.rows.map(row => [
            // don't parse as timestamp if we're going to display as a quantitative scale, e.x. years and Unix timestamps
            (isDimensionTimeseries && !isQuantitative) ?
                HACK_parseTimestamp(row[0], s.data.cols[0].unit)
            : isDimensionNumeric ?
                row[0]
            :
                String(row[0])
            , ...row.slice(1)
        ])
    );

    // compute the x-values
    let xValues = getXValues(datas, chartType);

    // compute the domain
    let xDomain = d3.extent(xValues);

    let xInterval;
    if (isTimeseries) {
        // compute the interval
        let unit = minTimeseriesUnit(series.map(s => s.data.cols[0].unit));
        xInterval = computeTimeseriesDataInverval(xValues, unit);
    } else if (isQuantitative) {
        xInterval = computeNumericDataInverval(xValues);
    }

    if (settings["line.missing"] === "zero" || settings["line.missing"] === "none") {
        if (isTimeseries) {
            // replace xValues with
            xValues = d3.time[xInterval.interval]
                .range(xDomain[0], moment(xDomain[1]).add(1, "ms"), xInterval.count);
            datas = fillMissingValues(
                datas,
                xValues,
                settings["line.missing"] === "zero" ? 0 : null,
                (m) => d3.round(m.toDate().getTime(), -1) // sometimes rounds up 1ms?
            );
        } if (isQuantitative) {
            xValues = d3.range(xDomain[0], xDomain[1] + xInterval, xInterval);
            datas = fillMissingValues(
                datas,
                xValues,
                settings["line.missing"] === "zero" ? 0 : null,
            );
        } else {
            datas = fillMissingValues(
                datas,
                xValues,
                settings["line.missing"] === "zero" ? 0 : null
            );
        }
    }

    if (isScalarSeries) {
        xValues = datas.map(data => data[0][0]);
    }

    let dimension, groups, yAxisSplit;

    const isScatter = chartType === "scatter";
    const isStacked = settings["stackable.stacked"] && datas.length > 1

    if (isScatter) {
        let dataset = crossfilter();
        datas.map(data => dataset.add(data));

        dimension = dataset.dimension(d => [d[0], d[1]]);
        groups = datas.map(data => {
            let dim = crossfilter(data).dimension(d => d);
            return [
                dim.group().reduceSum((d) => d[2] || 1)
            ]
        });
    } else if (isStacked) {
        let dataset = crossfilter();
        datas.map((data, i) =>
            dataset.add(data.map(d => ({
                [0]: d[0],
                [i + 1]: d[1]
            })))
        );

        dimension = dataset.dimension(d => d[0]);
        groups = [
            datas.map((data, i) =>
                reduceGroup(dimension.group(), i + 1)
            )
        ];
    } else {
        let dataset = crossfilter();
        datas.map(data => dataset.add(data));

        dimension = dataset.dimension(d => d[0]);
        groups = datas.map(data => {
            let dim = crossfilter(data).dimension(d => d[0]);
            return data[0].slice(1).map((_, i) =>
                reduceGroup(dim.group(), i + 1)
            );
        });
    }

    let yExtents = groups.map(group => d3.extent(group[0].all(), d => d.value));
    let yExtent = d3.extent([].concat(...yExtents));

    if (!isScalarSeries && !isScatter && !isStacked && settings["graph.y_axis.auto_split"] !== false) {
        yAxisSplit = computeSplit(yExtents);
    } else {
        yAxisSplit = [series.map((s,i) => i)];
    }

    // HACK: This ensures each group is sorted by the same order as xValues,
    // otherwise we can end up with line charts with x-axis labels in the correct order
    // but the points in the wrong order. There may be a more efficient way to do this.
    // Don't apply to linear or timeseries X-axis since the points are always plotted in order
    if (!isTimeseries && !isQuantitative) {
        let sortMap = new Map()
        for (const [index, key] of xValues.entries()) {
            sortMap.set(key, index);
        }
        for (const group of groups) {
            group.forEach(g => {
                const sorted = g.top(Infinity).sort((a, b) => sortMap.get(a.key) - sortMap.get(b.key));
                g.all = () => sorted;
            });
        }
    }

    let parent = dc.compositeChart(element);
    applyChartBoundary(parent, element);
    parent.transitionDuration(0);

    let charts = groups.map((group, index) => {
        let chart = dc[getDcjsChartType(chartType)](parent);

        // disable clicks
        chart.onClick = () => {};

        chart
            .dimension(dimension)
            .group(group[0])
            .transitionDuration(0)
            .useRightYAxis(yAxisSplit.length > 1 && yAxisSplit[1].includes(index));

        if (isScatter) {
            chart
                .keyAccessor((d) => d.key[0])
                .valueAccessor((d) => d.key[1])

            if (chart.radiusValueAccessor) {
                const isBubble = datas[index][0].length > 2;
                if (isBubble) {
                    const BUBBLE_SCALE_FACTOR_MAX = 64;
                    chart
                        .radiusValueAccessor((d) => d.value)
                        .r(d3.scale.sqrt()
                            .domain([0, yExtent[1] * BUBBLE_SCALE_FACTOR_MAX])
                            .range([0, 1])
                        );
                } else {
                    chart.radiusValueAccessor((d) => 1)
                    chart.MIN_RADIUS = 3
                }
                chart.minRadiusWithLabel(Infinity);
            }
        }

        if (chart.defined) {
            chart.defined(
                settings["line.missing"] === "none" ?
                    (d) => d.y != null :
                    (d) => true
            );
        }

        // multiple series
        if (groups.length > 1 || isScatter) {
            // multiple stacks
            if (group.length > 1) {
                // compute shades of the assigned color
                chart.ordinalColors(colorShades(colors[index % colors.length], group.length))
            } else {
                chart.colors(colors[index % colors.length])
            }
        } else {
            chart.ordinalColors(colors)
        }

        for (var i = 1; i < group.length; i++) {
            chart.stack(group[i])
        }

        applyChartLineBarSettings(chart, settings, chartType);

        return chart;
    });

    let onGoalHover = () => {};
    if (settings["graph.show_goal"]) {
        const goalData = [[xDomain[0], settings["graph.goal_value"]], [xDomain[1], settings["graph.goal_value"]]];
        const goalDimension = crossfilter(goalData).dimension(d => d[0]);
        const goalGroup = goalDimension.group().reduceSum(d => d[1]);
        const goalIndex = charts.length;
        let goalChart = dc.lineChart(parent)
            .dimension(goalDimension)
            .group(goalGroup)
            .on('renderlet', function (chart) {
                // remove "sub" class so the goal is not used in voronoi computation
                chart.select(".sub._"+goalIndex)
                    .classed("sub", false)
                    .classed("goal", true);
            });
        charts.push(goalChart);

        onGoalHover = (element) => {
            onHoverChange(element && {
                element: element,
                data: [{ key: "Goal", value: settings["graph.goal"] }]
            });
        }
    }

    let chart = parent.compose(charts);

    if (groups.length > 1 && !isScalarSeries) {
        chart.on("renderlet.grouped-bar", function (chart) {
            // HACK: dc.js doesn't support grouped bar charts so we need to manually resize/reposition them
            // https://github.com/dc-js/dc.js/issues/558
            let barCharts = chart.selectAll(".sub rect:first-child")[0].map(node => node.parentNode.parentNode.parentNode);
            if (barCharts.length > 0) {
                let oldBarWidth = parseFloat(barCharts[0].querySelector("rect").getAttribute("width"));
                let newBarWidthTotal = oldBarWidth / barCharts.length;
                let seriesPadding =
                    newBarWidthTotal < 4 ? 0 :
                    newBarWidthTotal < 8 ? 1 :
                                           2;
                let newBarWidth = Math.max(1, newBarWidthTotal - seriesPadding);

                chart.selectAll("g.sub rect").attr("width", newBarWidth);
                barCharts.forEach((barChart, index) => {
                    barChart.setAttribute("transform", "translate(" + ((newBarWidth + seriesPadding) * index) + ", 0)");
                });
            }
        })
    }

    // HACK: compositeChart + ordinal X axis shenanigans
    if (chartType === "bar") {
        chart._rangeBandPadding(BAR_PADDING_RATIO) // https://github.com/dc-js/dc.js/issues/678
    } else {
        chart._rangeBandPadding(1) // https://github.com/dc-js/dc.js/issues/662
    }

    // x-axis settings
    if (isTimeseries) {
        applyChartTimeseriesXAxis(chart, settings, series, xValues, xDomain, xInterval);
    } else if (isQuantitative) {
        applyChartQuantitativeXAxis(chart, settings, series, xValues, xDomain, xInterval);
    } else {
        applyChartOrdinalXAxis(chart, settings, series, xValues);
    }

    // y-axis settings
    let [left, right] = yAxisSplit.map(indexes => ({
        series: indexes.map(index => series[index]),
        extent: d3.extent([].concat(...indexes.map(index => yExtents[index])))
    }));
    if (left && left.series.length > 0) {
        applyChartYAxis(chart, settings, left.series, left.extent, "left");
    }
    if (right && right.series.length > 0) {
        applyChartYAxis(chart, settings, right.series, right.extent, "right");
    }
    const isSplitAxis = (right && right.series.length) && (left && left.series.length > 0);

    applyChartTooltips(chart, series, (hovered) => {
        if (onHoverChange) {
            // disable tooltips on lines
            if (hovered && hovered.element && hovered.element.classList.contains("line")) {
                delete hovered.element;
            }
            onHoverChange(hovered);
        }
    });

    // if the chart supports 'brushing' (brush-based range filter), disable this since it intercepts mouse hovers which means we can't see tooltips
    if (chart.brushOn) {
        chart.brushOn(false);
    }

    // render
    chart.render();

    // apply any on-rendering functions
    lineAndBarOnRender(chart, settings, onGoalHover, isSplitAxis);

    onRender && onRender({ yAxisSplit });

    return chart;
}
