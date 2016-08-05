import crossfilter from "crossfilter";
import d3 from "d3";
import dc from "dc";
import moment from "moment";

import {
    getAvailableCanvasWidth,
    getAvailableCanvasHeight,
    computeSplit,
    getFriendlyName,
    getXValues
} from "./utils";

import {
    minTimeseriesUnit,
    dimensionIsTimeseries,
    computeTimeseriesDataInverval,
    computeTimeseriesTicksInterval
} from "./timeseries";

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
        case "bar":  return "barChart";
        default:     return "barChart";
    }
}

function initializeChart(card, element, chartType = getDcjsChartType(card.display)) {
    // create the chart
    let chart = dc[chartType](element);

    // set width and height
    chart = applyChartBoundary(chart, element);

    // disable animations
    chart.transitionDuration(0);

    return chart;
}

function applyChartBoundary(chart, element) {
    return chart
        .width(getAvailableCanvasWidth(element))
        .height(getAvailableCanvasHeight(element));
}

function applyChartTimeseriesXAxis(chart, settings, series, xValues) {
    // setup an x-axis where the dimension is a timeseries
    let dimensionColumn = series[0].data.cols[0];

    let unit = minTimeseriesUnit(series.map(s => s.data.cols[0].unit));

    // compute the data interval
    let dataInterval = computeTimeseriesDataInverval(xValues, unit);
    let tickInterval = dataInterval;

    // compute the domain
    let xDomain = d3.extent(xValues);

    if (settings["graph.x_axis.labels_enabled"]) {
        chart.xAxisLabel(settings["graph.x_axis.title_text"] || getFriendlyName(dimensionColumn));
    }
    if (settings["graph.x_axis.axis_enabled"]) {
        chart.renderVerticalGridLines(settings["graph.x_axis.gridLine_enabled"]);

        if (dimensionColumn.unit == null) {
            dimensionColumn = { ...dimensionColumn, unit: dataInterval.interval };
        }

        chart.xAxis().tickFormat(timestamp => {
            // these dates are in the browser's timezone, change to UTC
            let timestampUTC = moment(timestamp).format().replace(/[+-]\d+:\d+$/, "Z");
            return formatValue(timestampUTC, { column: dimensionColumn })
        });

        // Compute a sane interval to display based on the data granularity, domain, and chart width
        tickInterval = computeTimeseriesTicksInterval(xValues, unit, chart.width(), MIN_PIXELS_PER_TICK.x);
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

function applyChartYAxis(chart, settings, series, yAxisSplit) {

    if (settings["graph.y_axis.labels_enabled"]) {
        // left
        if (settings["graph.y_axis.title_text"]) {
            chart.yAxisLabel(settings["graph.y_axis.title_text"]);
        } else if (yAxisSplit[0].length === 1) {
            chart.yAxisLabel(getFriendlyName(series[yAxisSplit[0][0]].data.cols[1]));
        }
        // right
        if (yAxisSplit.length > 1 && yAxisSplit[1].length === 1) {
            chart.rightYAxisLabel(getFriendlyName(series[yAxisSplit[1][0]].data.cols[1]));
        }
    }

    if (settings["graph.y_axis.axis_enabled"]) {
        chart.renderHorizontalGridLines(true);

        adjustTicksIfNeeded(chart.yAxis(), chart.height(), MIN_PIXELS_PER_TICK.y);
        if (yAxisSplit.length > 1 && chart.rightYAxis) {
            adjustTicksIfNeeded(chart.rightYAxis(), chart.height(), MIN_PIXELS_PER_TICK.y);
        }
    } else {
        chart.yAxis().ticks(0);
        if (chart.rightYAxis) {
            chart.rightYAxis().ticks(0);
        }
    }

    if (settings["graph.y_axis.auto_range"]) {
        chart.elasticY(true);
    } else {
        chart.y(d3.scale.linear().domain([settings["graph.y_axis.min"], settings["graph.y_axis.max"]]))
    }
}

function applyChartTooltips(chart, onHoverChange) {
    chart.on("renderlet.tooltips", function(chart) {
        chart.selectAll(".bar, .dot, .area, .line, g.pie-slice, g.features")
            .on("mousemove", function(d, i) {
                onHoverChange && onHoverChange({
                    index: determineSeriesIndexFromElement(this),
                    element: this,
                    d: d,
                    data: d.data
                });
            })
            .on("mouseleave", function() {
                onHoverChange && onHoverChange(null);
            });

        chart.selectAll("title").remove();
    });
}

function applyChartLineBarSettings(chart, settings, chartType, isLinear, isTimeseries) {
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
            .centerBar(isLinear || isTimeseries);
    }
}

function lineAndBarOnRender(chart, settings) {
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
        const dots = chart.svg().selectAll(".dc-tooltip .dot")[0];

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
        hideDisabledLabels();
        hideDisabledAxis();
        hideBadAxis();
        disableClickFiltering();
    });

    chart.render();
}

export default function lineAreaBar(element, { series, onHoverChange, onRender, chartType, isScalarSeries, settings }) {
    const colors = settings["graph.colors"];

    const isTimeseries = dimensionIsTimeseries(series[0].data);
    const isLinear = false;

    // validation.  we require at least 2 rows for line charting
    if (series[0].data.cols.length < 2) {
        return;
    }

    let datas = series.map((s, index) =>
        s.data.rows.map(row => [
            (isTimeseries) ? parseTimestamp(row[0]) : String(row[0]),
            ...row.slice(1)
        ])
    );

    let xValues = getXValues(datas, chartType);

    let dimension, groups, yAxisSplit;

    if (settings["stackable.stacked"] && datas.length > 1) {
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
                dimension.group().reduceSum(d => (d[i + 1] || 0))
            )
        ];

        yAxisSplit = [series.map((s,i) => i)];
    } else {
        let dataset = crossfilter();
        datas.map(data => dataset.add(data));

        dimension = dataset.dimension(d => d[0]);
        groups = datas.map(data => {
            let dim = crossfilter(data).dimension(d => d[0]);
            return data[0].slice(1).map((_, i) =>
                dim.group().reduceSum(d => (d[i + 1] || 0))
            )
        });

        let yExtents = groups.map(group => d3.extent(group[0].all(), d => d.value));

        if (!isScalarSeries && settings["graph.y_axis.auto_split"] !== false) {
            yAxisSplit = computeSplit(yExtents);
        } else {
            yAxisSplit = [series.map((s,i) => i)];
        }
    }

    if (isScalarSeries) {
        xValues = datas.map(data => data[0][0]);
    }

    // HACK: This ensures each group is sorted by the same order as xValues,
    // otherwise we can end up with line charts with x-axis labels in the correct order
    // but the points in the wrong order. There may be a more efficient way to do this.
    // Don't apply to linear or timeseries X-axis since the points are always plotted in order
    if (!isTimeseries && !isLinear) {
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

    let parent;
    if (groups.length > 1) {
        parent = initializeChart(series[0].card, element, "compositeChart")
    } else {
        parent = element;
    }

    let charts = groups.map((group, index) => {
        let chart = dc[getDcjsChartType(chartType)](parent);

        chart
            .dimension(dimension)
            .group(group[0])
            .transitionDuration(0)
            .useRightYAxis(yAxisSplit.length > 1 && yAxisSplit[1].includes(index))

        // multiple series
        if (groups.length > 1) {
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

        applyChartLineBarSettings(chart, settings, chartType, isLinear, isTimeseries);

        return chart;
    });

    let chart;
    if (charts.length > 1) {
        chart = parent.compose(charts);

        if (!isScalarSeries) {
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
    } else {
        chart = charts[0];
        chart.transitionDuration(0)
        applyChartBoundary(chart, element);
    }

    // x-axis settings
    // TODO: we should support a linear (numeric) x-axis option
    if (isTimeseries) {
        applyChartTimeseriesXAxis(chart, settings, series, xValues);
    } else {
        applyChartOrdinalXAxis(chart, settings, series, xValues);
    }

    // y-axis settings
    // TODO: if we are multi-series this could be split axis
    applyChartYAxis(chart, settings, series, yAxisSplit);

    applyChartTooltips(chart, (hovered) => {
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
    lineAndBarOnRender(chart, settings);

    onRender && onRender({ yAxisSplit });

    return chart;
}
