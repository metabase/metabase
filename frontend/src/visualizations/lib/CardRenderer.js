/*global google*/

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

const MIN_PIXELS_PER_TICK = { x: 100, y: 30 };
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
        case "pie":  return "pieChart";
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

    // specify legend
    chart = applyChartLegend(chart, card);

    // disable animations
    chart.transitionDuration(0);

    return chart;
}

function applyChartBoundary(chart, element) {
    return chart
        .width(getAvailableCanvasWidth(element))
        .height(getAvailableCanvasHeight(element));
}

function applyChartLegend(chart, card) {
    // ENABLE LEGEND IF SPECIFIED IN VISUALIZATION SETTINGS
    // I'm sure it made sense to somebody at some point to make this setting live in two different places depending on the type of chart.
    let settings = card.visualization_settings;
    let legendEnabled = false;

    if (card.display === "pie" && settings.pie) {
        legendEnabled = settings.pie.legend_enabled;
    } else if (settings.chart) {
        legendEnabled = settings.chart.legend_enabled;
    }

    if (legendEnabled) {
        return chart.legend(dc.legend());
    } else {
        return chart;
    }
}

function applyChartTimeseriesXAxis(chart, series, xValues) {
    // setup an x-axis where the dimension is a timeseries
    const settings = series[0].card.visualization_settings;
    const dimensionColumn = series[0].data.cols[0];

    let unit = minTimeseriesUnit(series.map(s => s.data.cols[0].unit));

    if (settings.xAxis.labels_enabled) {
        chart.xAxisLabel(settings.xAxis.title_text || getFriendlyName(dimensionColumn));
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
        const { interval, count } = computeTimeseriesTicksInterval(xValues, unit, chart.width(), MIN_PIXELS_PER_TICK.x);
        chart.xAxis().ticks(d3.time[interval], count);
    } else {
        chart.xAxis().ticks(0);
    }

    // compute the data interval
    const { interval, count } = computeTimeseriesDataInverval(xValues, unit);

    // compute the domain
    let xDomain = d3.extent(xValues);
    // pad the domain slightly to prevent clipping
    xDomain[0] = moment(xDomain[0]).subtract(count * 0.75, interval);
    xDomain[1] = moment(xDomain[1]).add(count * 0.75, interval);

    // set the x scale
    chart.x(d3.time.scale.utc().domain(xDomain));

    // set the x units (used to compute bar size)
    chart.xUnits((start, stop) => Math.ceil(1 + moment(stop).diff(start, interval) / count));
}

function applyChartOrdinalXAxis(chart, series, xValues) {
    const settings = series[0].card.visualization_settings;
    const dimensionColumn = series[0].data.cols[0];
    if (settings.xAxis.labels_enabled) {
        chart.xAxisLabel(settings.xAxis.title_text || getFriendlyName(dimensionColumn));
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

function applyChartYAxis(chart, series, yAxisSplit) {
    let settings = series[0].card.visualization_settings;
    if (settings.yAxis.labels_enabled) {
        chart.renderHorizontalGridLines(true);
        chart.elasticY(true);

        // left
        if (settings.yAxis.title_text) {
            chart.yAxisLabel(settings.yAxis.title_text);
        } else if (yAxisSplit[0].length === 1) {
            chart.yAxisLabel(getFriendlyName(series[yAxisSplit[0][0]].data.cols[1]));
        }
        adjustTicksIfNeeded(chart.yAxis(), chart.height(), MIN_PIXELS_PER_TICK.y);

        // right
        if (yAxisSplit.length > 1) {
            if (yAxisSplit[1].length === 1) {
                chart.rightYAxisLabel(getFriendlyName(series[yAxisSplit[1][0]].data.cols[1]));
            }
            if (chart.rightYAxis) {
                adjustTicksIfNeeded(chart.rightYAxis(), chart.height(), MIN_PIXELS_PER_TICK.y);
            }
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
                if (onHoverChange) {
                    onHoverChange(this, d, determineSeriesIndexFromElement(this));
                }
            })
            .on("mouseleave", function() {
                onHoverChange && onHoverChange(null);
            });

        chart.selectAll("title").remove();
    });
}

function applyChartLineBarSettings(chart, card, chartType, isLinear, isTimeseries) {
    // if the chart supports 'brushing' (brush-based range filter), disable this since it intercepts mouse hovers which means we can't see tooltips
    if (chart.brushOn) {
        chart.brushOn(false);
    }

    // LINE/AREA:
    // for chart types that have an 'interpolate' option (line/area charts), enable based on settings
    if (chart.interpolate) {
        if (card.visualization_settings.line.step) {
            chart.interpolate("step");
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

function lineAndBarOnRender(chart, card) {
    // once chart has rendered and we can access the SVG, do customizations to axis labels / etc that you can't do through dc.js
    let svg = chart.svg();
    let settings = card.visualization_settings;
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

    chart.on("renderlet.line-and-bar-onrender", (chart) => {
        for (let elem of chart.selectAll(".sub, .chart-body")[0]) {
            // prevents dots from being clipped:
            elem.removeAttribute("clip-path");
            // move chart content on top of axis (z-index doesn't work on SVG):
            elem.parentNode.appendChild(elem);
        }
        for (let elem of chart.svg().selectAll('.dc-tooltip circle.dot')[0]) {
            // set the color of the dots to the fill color so we can use currentColor in CSS rules:
            elem.style.color = elem.getAttribute("fill");
        }
    });

    chart.on("renderlet.enable-dots", (chart) => {
        let enableDots;
        const dots = chart.svg().selectAll(".dc-tooltip .dot")[0];
        if (dots.length > 500) {
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
    });

    chart.on("renderlet.voronoi-hover", (chart) => {
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
    });

    function adjustMargin(margin, direction, axisSelector, labelSelector) {
        let axis = chart.select(axisSelector).node();
        let label = chart.select(labelSelector).node();
        let axisSize = axis ? axis.getBoundingClientRect()[direction] : 0;
        let labelSize = label ? label.getBoundingClientRect()[direction] : 0;
        chart.margins()[margin] = axisSize + labelSize + 15;
    }

    // adjust the margins to fit the X and Y axis tick and label sizes, and rerender
    adjustMargin("bottom", "height", ".axis.x",  ".x-axis-label");
    adjustMargin("left",   "width",  ".axis.y",  ".y-axis-label.y-label");
    adjustMargin("right",  "width",  ".axis.yr", ".y-axis-label.yr-label");

    chart.render();
}

export let CardRenderer = {
    pie(element, { card, data, onHoverChange }) {
        let settings = card.visualization_settings;
        let chartData = data.rows.map(row => ({
            key: row[0],
            value: row[1]
        }));
        let sumTotalValue = chartData.reduce((acc, d) => acc + d.value, 0);

        // TODO: by default we should set a max number of slices of the pie and group everything else together

        // build crossfilter dataset + dimension + base group
        let dataset = crossfilter(chartData);
        let dimension = dataset.dimension(d => d.key);
        let group = dimension.group().reduceSum(d => d.value);
        let chart = initializeChart(card, element)
                        .dimension(dimension)
                        .group(group)
                        .colors(settings.pie.colors)
                        .colorCalculator((d, i) => settings.pie.colors[((i * 5) + Math.floor(i / 5)) % settings.pie.colors.length])
                        .label(row => formatValue(row.key, data.cols[0]))
                        .title(d => {
                            // ghetto rounding to 1 decimal digit since Math.round() doesn't let
                            // you specify a precision and always rounds to int
                            let percent = Math.round((d.value / sumTotalValue) * 1000) / 10.0;
                            return d.key + ': ' + d.value + ' (' + percent + '%)';
                        });

        // disables ability to select slices
        chart.filter = () => {};

        applyChartTooltips(chart, onHoverChange);

        chart.render();
    },

    lineAreaBar(element, chartType, { series, onHoverChange, onRender, isScalarSeries, allowSplitAxis }) {
        const colors = getCardColors(series[0].card);

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

            applyChartLineBarSettings(chart, series[0].card, chartType, isLinear, isTimeseries);

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
            applyChartTimeseriesXAxis(chart, series, xValues);
        } else {
            applyChartOrdinalXAxis(chart, series, xValues);
        }

        // y-axis settings
        // TODO: if we are multi-series this could be split axis
        applyChartYAxis(chart, series, yAxisSplit);

        applyChartTooltips(chart, (e, d, seriesIndex) => {
            if (onHoverChange) {
                // disable tooltips on lines
                if (e && e.classList.contains("line")) {
                    e = null;
                }
                onHoverChange(e, d, seriesIndex);
            }
        });

        // if the chart supports 'brushing' (brush-based range filter), disable this since it intercepts mouse hovers which means we can't see tooltips
        if (chart.brushOn) {
            chart.brushOn(false);
        }

        // render
        chart.render();

        // apply any on-rendering functions
        lineAndBarOnRender(chart, series[0].card);

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
                applyChartTooltips(chart, (e, d, seriesIndex) => {
                    if (onHoverChange) {
                        if (d) {
                            let row = _.findWhere(data.rows, { [0]: d.properties.name });
                            d = row != null && {
                                data: { key: row[0], value: row[1] }
                            };
                        }
                        onHoverChange(e, d, seriesIndex);
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
                applyChartTooltips(chart, (e, d, seriesIndex) => {
                    if (onHoverChange) {
                        if (d) {
                            let row = _.findWhere(data.rows, { [0]: d.properties.ISO_A2 });
                            d = row != null && {
                                data: { key: d.properties.NAME, value: row[1] }
                            };
                        }
                        onHoverChange(e, d, seriesIndex);
                    }
                });
            })
            .render();

        return chartRenderer;
    },

    pin_map(element, { card, updateMapCenter, updateMapZoom }) {
        let query = card.dataset_query;
        let vs = card.visualization_settings;
        let latitude_dataset_col_index = vs.map.latitude_dataset_col_index;
        let longitude_dataset_col_index = vs.map.longitude_dataset_col_index;
        let latitude_source_table_field_id = vs.map.latitude_source_table_field_id;
        let longitude_source_table_field_id = vs.map.longitude_source_table_field_id;

        if (latitude_dataset_col_index == null || longitude_dataset_col_index == null) {
            return;
        }

        if (latitude_source_table_field_id == null || longitude_source_table_field_id == null) {
            throw ("Map ERROR: latitude and longitude column indices must be specified");
        }
        if (latitude_dataset_col_index == null || longitude_dataset_col_index == null) {
            throw ("Map ERROR: unable to find specified latitude / longitude columns in source table");
        }

        let mapOptions = {
            zoom: vs.map.zoom,
            center: new google.maps.LatLng(vs.map.center_latitude, vs.map.center_longitude),
            mapTypeId: google.maps.MapTypeId.MAP,
            scrollwheel: false
        };

        let markerImageMapType = new google.maps.ImageMapType({
            getTileUrl: (coord, zoom) =>
                '/api/tiles/' + zoom + '/' + coord.x + '/' + coord.y + '/' +
                    latitude_source_table_field_id + '/' + longitude_source_table_field_id + '/' +
                    latitude_dataset_col_index + '/' + longitude_dataset_col_index + '/' +
                    '?query=' + encodeURIComponent(JSON.stringify(query))
            ,
            tileSize: new google.maps.Size(256, 256)
        });

        let height = getAvailableCanvasHeight(element);
        if (height != null) {
            element.style.height = height + "px";
        }

        let width = getAvailableCanvasWidth(element);
        if (width != null) {
            element.style.width = width + "px";
        }

        let map = new google.maps.Map(element, mapOptions);

        map.overlayMapTypes.push(markerImageMapType);

        map.addListener("center_changed", () => {
            let center = map.getCenter();
            updateMapCenter(center.lat(), center.lng());
        });

        map.addListener("zoom_changed", () => {
            updateMapZoom(map.getZoom());
        });

        /* We need to trigger resize at least once after
         * this function (re)configures the map, because if
         * a map already existed in this div (i.e. this
         * function was called as a result of a settings
         * change), then the map will re-render with
         * the new options once resize is called.
         * Otherwise, the map will not re-render.
         */
        google.maps.event.trigger(map, 'resize');

        //listen for resize event (internal to CardRenderer)
        //to let google maps api know about the resize
        //(see https://developers.google.com/maps/documentation/javascript/reference)
        element.addEventListener('cardrenderer-card-resized', () => google.maps.event.trigger(map, 'resize'));
    }
};
