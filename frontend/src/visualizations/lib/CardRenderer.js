import _ from "underscore";
import crossfilter from "crossfilter";
import d3 from "d3";
import dc from "dc";
import moment from "moment";

import GeoHeatmapChartRenderer from "./GeoHeatmapChartRenderer";

import {
    getAvailableCanvasWidth,
    getAvailableCanvasHeight,
    computeSplit,
    getFriendlyName,
    getCardColors
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
    const dimensionColumn = series[0].data.cols[0];

    let unit = minTimeseriesUnit(series.map(s => s.data.cols[0].unit));

    // compute the data interval
    let dataInterval = computeTimeseriesDataInverval(xValues, unit);
    let tickInterval = dataInterval;

    if (settings.xAxis.labels_enabled) {
        chart.xAxisLabel(settings.xAxis.title_text || getFriendlyName(dimensionColumn));
    }
    if (settings.xAxis.axis_enabled) {
        chart.renderVerticalGridLines(settings.xAxis.gridLine_enabled);

        if (dimensionColumn && dimensionColumn.unit) {
            chart.xAxis().tickFormat(d => formatValue(d, dimensionColumn));
        } else {
            chart.xAxis().tickFormat(d3.time.format.multi([
                [".%L",    (d) => d.getMilliseconds()],
                [":%S",    (d) => d.getSeconds()],
                ["%I:%M",  (d) => d.getMinutes()],
                ["%I %p",  (d) => d.getHours()],
                ["%a %d",  (d) => d.getDay() && d.getDate() != 1],
                ["%b %d",  (d) => d.getDate() != 1],
                ["%B", (d) => d.getMonth()], // default "%B"
                ["%Y", () => true] // default "%Y"
            ]));
        }

        // Compute a sane interval to display based on the data granularity, domain, and chart width
        tickInterval = computeTimeseriesTicksInterval(xValues, unit, chart.width(), MIN_PIXELS_PER_TICK.x);
        chart.xAxis().ticks(d3.time[tickInterval.interval], tickInterval.count);
    } else {
        chart.xAxis().ticks(0);
    }

    // compute the domain
    let xDomain = d3.extent(xValues);
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

    if (settings.xAxis.labels_enabled) {
        chart.xAxisLabel(settings.xAxis.title_text || getFriendlyName(dimensionColumn));
    }
    if (settings.xAxis.axis_enabled) {
        chart.renderVerticalGridLines(settings.xAxis.gridLine_enabled);
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
        chart.xAxis().tickFormat(d => formatValue(d, dimensionColumn));
    } else {
        chart.xAxis().ticks(0);
        chart.xAxis().tickFormat('');
    }

    chart.x(d3.scale.ordinal().domain(xValues))
        .xUnits(dc.units.ordinal);
}

function applyChartYAxis(chart, settings, series, yAxisSplit) {

    if (settings.yAxis.labels_enabled) {
        // left
        if (settings.yAxis.title_text) {
            chart.yAxisLabel(settings.yAxis.title_text);
        } else if (yAxisSplit[0].length === 1) {
            chart.yAxisLabel(getFriendlyName(series[yAxisSplit[0][0]].data.cols[1]));
        }
        // right
        if (yAxisSplit.length > 1 && yAxisSplit[1].length === 1) {
            chart.rightYAxisLabel(getFriendlyName(series[yAxisSplit[1][0]].data.cols[1]));
        }
    }

    if (settings.yAxis.axis_enabled) {
        chart.renderHorizontalGridLines(true);
        chart.elasticY(true);

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
        if (settings.line.interpolate) {
            chart.interpolate(settings.line.interpolate);
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
    let svg = chart.svg();
    let x = settings.xAxis;
    let y = settings.yAxis;

    /// return a function to set attrName to attrValue for element(s) if attrValue is not null
    /// optional ATTRVALUETRANSFORMFN can be used to modify ATTRVALUE before it is set
    let customizer = function(element) {
        return function(attrName, attrValue, attrValueTransformFn) {
            if (attrValue) {
                if (attrValueTransformFn != null) {
                    attrValue = attrValueTransformFn(attrValue);
                }
                if (element.length != null) {
                    let len = element.length;
                    for (let i = 0; i < len; i++) {
                        element[i].setAttribute(attrName, attrValue);
                    }
                } else {
                    element.setAttribute(attrName, attrValue);
                }
            }
        };
    };
    // x-axis label customizations
    try {
        let customizeX = customizer(svg.select('.x-axis-label').node());
        customizeX('fill', x.title_color);
        customizeX('font-size', x.title_font_size);
    } catch (e) {}

    // y-axis label customizations
    try {
        let customizeY = customizer(svg.select('.y-axis-label').node());
        customizeY('fill', y.title_color);
        customizeY('font-size', y.title_font_size);
    } catch (e) {}

    // grid lines - .grid-line .horizontal, .vertical
    try {
        let customizeVertGL = customizer(svg.select('.grid-line.vertical').node().children);
        customizeVertGL('stroke-width', x.gridLineWidth);
        customizeVertGL('style', x.gridLineColor, (colorStr) => 'stroke:' + colorStr + ';');
    } catch (e) {}

    try {
        let customizeHorzGL = customizer(svg.select('.grid-line.horizontal').node().children);
        customizeHorzGL('stroke-width', y.gridLineWidth);
        customizeHorzGL('style', y.gridLineColor, (colorStr) => 'stroke:' + '#ddd' + ';');
    } catch (e) {}


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
        if (settings.line && !settings.line.marker_enabled) {
            enableDots = false;
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
       if (!x.labels_enabled) {
        //    chart.selectAll(".x-axis-label").remove();
       }
       if (!y.labels_enabled) {
        //    chart.selectAll(".y-axis-label").remove();
       }
    }

    function hideDisabledAxis() {
       if (!x.axis_enabled) {
           chart.selectAll(".axis.x").remove();
        //    chart.selectAll(".x-axis-label").remove();
       }
       if (!y.axis_enabled) {
           chart.selectAll(".axis.y, .axis.yr").remove();
        //    chart.selectAll(".y-axis-label").remove();
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

    // run these first so the rest of the margin computations take it into account
    hideDisabledLabels();
    hideDisabledAxis();
    hideBadAxis();

    // should be run before adjusting margins
    let mins = computeMinHorizontalMargins()

    // adjust the margins to fit the X and Y axis tick and label sizes, if enabled
    adjustMargin("bottom", "height", ".axis.x",  ".x-axis-label", x.labels_enabled);
    adjustMargin("left",   "width",  ".axis.y",  ".y-axis-label.y-label", y.labels_enabled);
    adjustMargin("right",  "width",  ".axis.yr", ".y-axis-label.yr-label", y.labels_enabled);

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
    });

    chart.render();
}

export let CardRenderer = {
    lineAreaBar(element, chartType, { series, onHoverChange, onRender, isScalarSeries, allowSplitAxis }) {
        const colors = getCardColors(series[0].card);

        const settings = series[0].card.visualization_settings;

        const isTimeseries = dimensionIsTimeseries(series[0].data);
        const isStacked = chartType === "area";
        const isLinear = false;

        // validation.  we require at least 2 rows for line charting
        if (series[0].data.cols.length < 2) {
            return;
        }

        let datas = series.map((s, index) =>
            s.data.rows.map(row => [
                (isTimeseries) ? new Date(row[0]) : row[0],
                ...row.slice(1)
            ])
        );

        let dimension, groups, xValues, yAxisSplit;
        if (isStacked && datas.length > 1) {
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

            xValues = dimension.group().all().map(d => d.key);
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

            xValues = dimension.group().all().map(d => d.key);
            let yExtents = groups.map(group => d3.extent(group[0].all(), d => d.value));

            if (allowSplitAxis) {
                yAxisSplit = computeSplit(yExtents);
            } else {
                yAxisSplit = [series.map((s,i) => i)];
            }
        }

        if (isScalarSeries) {
            xValues = datas.map(data => data[0][0]);
        }

        let parent;
        if (groups.length > 1) {
            parent = initializeChart(series[0].card, element, "compositeChart")
        } else {
            parent = element;
        }

        let charts = groups.map((group, index) => {
            let chart = dc[getDcjsChartType(chartType)](parent);
            let chartColors;

            // multiple series
            if (groups.length > 1) {
                // multiple stacks
                if (group.length > 1) {
                    // compute shades of the assigned color
                    chartColors = colorShades(colors[index % colors.length], group.length);
                } else {
                    chartColors = colors[index % colors.length];
                }
            } else {
                chartColors = colors;
            }

            chart
                .dimension(dimension)
                .group(group[0])
                .transitionDuration(0)
                .useRightYAxis(yAxisSplit.length > 1 && yAxisSplit[1].includes(index))

            if (chartType === "area") {
                chart.ordinalColors(chartColors)
            } else {
                chart.colors(chartColors)
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
    },

    bar(element, props) {
        return CardRenderer.lineAreaBar(element, "bar", props);
    },

    line(element, props) {
        return CardRenderer.lineAreaBar(element, "line", props);
    },

    area(element, props) {
        return CardRenderer.lineAreaBar(element, "area", props);
    },

    state(element, { card, data, onHoverChange }) {
        let chartData = data.rows.map(value => ({
            stateCode: value[0],
            value: value[1]
        }));

        let chartRenderer = new GeoHeatmapChartRenderer(element, card, data)
            .setData(chartData, 'stateCode', 'value')
            .setJson('/app/charts/us-states.json', d => d.properties.name)
            .setProjection(d3.geo.albersUsa())
            .customize(chart => {
                applyChartTooltips(chart, (hovered) => {
                    if (onHoverChange) {
                        if (hovered && hovered.d) {
                            let row = _.findWhere(data.rows, { [0]: hovered.d.properties.name });
                            hovered.data = { key: row[0], value: row[1] };
                        }
                        onHoverChange && onHoverChange(hovered);
                    }
                });
            })
            .render();

        return chartRenderer;
    },

    country(element, { card, data, onHoverChange }) {
        let chartData = data.rows.map(value => {
            // Does this actually make sense? If country is > 2 characters just use the first 2 letters as the country code ?? (WTF)
            let countryCode = value[0];
            if (typeof countryCode === "string") {
                countryCode = countryCode.substring(0, 2).toUpperCase();
            }

            return {
                code: countryCode,
                value: value[1]
            };
        });

        let chartRenderer = new GeoHeatmapChartRenderer(element, card, data)
            .setData(chartData, 'code', 'value')
            .setJson('/app/charts/world.json', d => d.properties.ISO_A2) // 2-letter country code
            .setProjection(d3.geo.mercator())
            .customize(chart => {
                applyChartTooltips(chart, (hovered) => {
                    if (onHoverChange) {
                        if (hovered && hovered.d) {
                            let row = _.findWhere(data.rows, { [0]: hovered.d.properties.ISO_A2 });
                            hovered.data = { key: hovered.d.properties.NAME, value: row[1] };
                        }
                        onHoverChange(hovered);
                    }
                });
            })
            .render();

        return chartRenderer;
    }
};
