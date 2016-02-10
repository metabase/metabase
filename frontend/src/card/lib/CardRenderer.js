/*global google*/

import _ from "underscore";
import crossfilter from "crossfilter";
import d3 from "d3";
import dc from "dc";
import moment from "moment";

import GeoHeatmapChartRenderer from "./GeoHeatmapChartRenderer";
import { getMinMax, getAvailableCanvasWidth, getAvailableCanvasHeight } from "./utils";

import { formatNumber, formatValue } from "metabase/lib/formatting";

import tip from 'd3-tip';
tip(d3);

// agument d3 with a simple quarters range implementation
d3.time.quarters = (start, stop, step) => d3.time.months(start, stop, 3);

// ---------------------------------------- TODO - Maybe. Lots of these things never worked in the first place. ----------------------------------------
// IMPORTANT
// - 'titles' (tooltips)
// - tweak padding for labels
//
// LESS IMPORTANT
// - axis customization
//   - axis.tickInterval
//   - axis.labels_step
//   - axis.lables.labels_staggerLines
// - line customization
//   - width
//   - marker (?)
//     - enabled
//     - fillColor
//     - lineColor
//   - border color
//   - chart customizations
//     - plotBackgroundColor
//     - zoomType
//     - panning
//     - panKey
// - pie.dataLabels_enabled

let MIN_PIXELS_PER_TICK = {
    x: 100,
    y: 50
};

// investigate the response from a dataset query and determine if the dimension is a timeseries
function dimensionIsTimeseries(result) {
    let hasDateField = result.cols && result.cols.length > 0 && result.cols[0].base_type === "DateField";

    let isDateFirstVal = false;
    if (result.rows && result.rows.length > 0 && result.rows[0].length > 0 &&
            !(!isNaN(parseFloat(result.rows[0][0])) && isFinite(result.rows[0][0]))) {
        isDateFirstVal = ( (new Date(result.rows[0][0]) !== "Invalid Date" && !isNaN(new Date(result.rows[0][0])) ));
    }

    return (hasDateField || isDateFirstVal);
}

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
        case "pie": return "pieChart";
        case "bar": return "barChart";
        case "line":
        case "area":
        case "timeseries": return "lineChart";
        default: return "barChart";
    }
}

function initializeChart(card, element, chartType) {
    chartType = (chartType) ? chartType : getDcjsChartType(card.display);

    // create the chart
    let chart = dc[chartType](element);

    // set width and height
    chart = applyChartBoundary(chart, card, element);

    // specify legend
    chart = applyChartLegend(chart, card);

    // disable animations
    chart.transitionDuration(0);

    return chart;
}

function applyChartBoundary(chart, card, element) {
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

function applyChartTimeseriesXAxis(chart, card, coldefs, data) {
    // setup an x-axis where the dimension is a timeseries

    let x = card.visualization_settings.xAxis;
    let xAxis = chart.xAxis();
    let xDomain = getMinMax(data, 0);

    // set the axis label
    if (x.labels_enabled) {
        chart.xAxisLabel((x.title_text || null) || coldefs[0].display_name);
        chart.renderVerticalGridLines(x.gridLine_enabled);

        if (coldefs[0] && coldefs[0].unit) {
            xAxis.tickFormat(d => formatValue(d, coldefs[0]));
        } else {
            xAxis.tickFormat(d3.time.format.multi([
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
        let interval = computeTimeseriesTicksInterval(data, coldefs[0], chart.width(), MIN_PIXELS_PER_TICK.x);
        xAxis.ticks(d3.time[interval.interval], interval.count);
    } else {
        xAxis.ticks(0);
    }

    // calculate the x-axis domain
    chart.x(d3.time.scale().domain(xDomain));

    // prevents skinny time series bar charts by using xUnits that match the provided column unit, if possible
    if (coldefs[0] && coldefs[0].unit && d3.time[coldefs[0].unit + "s"]) {
        chart.xUnits(d3.time[coldefs[0].unit + "s"]);
    }
}

// mostly matches https://github.com/mbostock/d3/wiki/Time-Scales
// Use UTC methods to avoid issues with daylight savings
const TIMESERIES_INTERVALS = [
    { interval: "ms",     count: 1,  testFn: (d) => 0                      }, // millisecond
    { interval: "second", count: 1,  testFn: (d) => d.getUTCMilliseconds() }, // 1 second
    { interval: "second", count: 5,  testFn: (d) => d.getUTCSeconds() % 5  }, // 5 seconds
    { interval: "second", count: 15, testFn: (d) => d.getUTCSeconds() % 15 }, // 15 seconds
    { interval: "second", count: 30, testFn: (d) => d.getUTCSeconds() % 30 }, // 30 seconds
    { interval: "minute", count: 1,  testFn: (d) => d.getUTCSeconds()      }, // 1 minute
    { interval: "minute", count: 5,  testFn: (d) => d.getUTCMinutes() % 5  }, // 5 minutes
    { interval: "minute", count: 15, testFn: (d) => d.getUTCMinutes() % 15 }, // 15 minutes
    { interval: "minute", count: 30, testFn: (d) => d.getUTCMinutes() % 30 }, // 30 minutes
    { interval: "hour",   count: 1,  testFn: (d) => d.getUTCMinutes()      }, // 1 hour
    { interval: "hour",   count: 3,  testFn: (d) => d.getUTCHours() % 3    }, // 3 hours
    { interval: "hour",   count: 6,  testFn: (d) => d.getUTCHours() % 6    }, // 6 hours
    { interval: "hour",   count: 12, testFn: (d) => d.getUTCHours() % 12   }, // 12 hours
    { interval: "day",    count: 1,  testFn: (d) => d.getUTCHours()        }, // 1 day
    { interval: "day",    count: 2,  testFn: (d) => d.getUTCDate() % 2     }, // 2 day
    { interval: "week",   count: 1,  testFn: (d) => 0                      }, // 1 week, TODO: fix this one
    { interval: "month",  count: 1,  testFn: (d) => d.getUTCDate()         }, // 1 months
    { interval: "month",  count: 3,  testFn: (d) => d.getUTCMonth() % 3    }, // 3 months
    { interval: "year",   count: 1,  testFn: (d) => d.getUTCMonth()        }  // 1 year
];

const TIMESERIES_INTERVAL_INDEX_BY_UNIT = {
    "minute": 1,
    "hour": 9,
    "day": 13,
    "week": 15,
    "month": 16,
    "quarter": 17,
    "year": 18,
};

function computeTimeseriesDataInvervalIndex(data) {
    // Keep track of the value seen for each level of granularity,
    // if any don't match then we know the data is *at least* that granular.
    let values = [];
    let index = TIMESERIES_INTERVALS.length;
    for (let row of data) {
        // Only need to check more granular than the current interval
        for (let i = 0; i < TIMESERIES_INTERVALS.length && i < index; i++) {
            let interval = TIMESERIES_INTERVALS[i];
            let value = interval.testFn(row[0]);
            if (values[i] === undefined) {
                values[i] = value;
            } else if (values[i] !== value) {
                index = i;
            }
        }
    }
    return index - 1;
}

function computeTimeseriesTicksInterval(data, col, chartWidth, minPixelsPerTick) {
    // If the interval that matches the data granularity results in too many ticks reduce the granularity until it doesn't.
    // TODO: compute this directly instead of iteratively
    let maxTickCount = Math.round(chartWidth / minPixelsPerTick);
    let domain = getMinMax(data, 0);
    let index = col && col.unit ? TIMESERIES_INTERVAL_INDEX_BY_UNIT[col.unit] : null;
    if (typeof index !== "number") {
        index = computeTimeseriesDataInvervalIndex(data);
    }
    while (index < TIMESERIES_INTERVALS.length - 1) {
        let interval = TIMESERIES_INTERVALS[index];
        let intervalMs = moment(0).add(interval.count, interval.interval).valueOf();
        let tickCount = (domain[1] - domain[0]) / intervalMs;
        if (tickCount <= maxTickCount) {
            break;
        }
        index++;
    }
    return TIMESERIES_INTERVALS[index];
}

function applyChartOrdinalXAxis(chart, card, coldefs, data, minPixelsPerTick) {
    // setup an x-axis where the dimension is ordinal

    let keys = data.map(d => d[0]);

    let x = card.visualization_settings.xAxis;
    let xAxis = chart.xAxis();

    if (x.labels_enabled) {
        chart.xAxisLabel((x.title_text || null) || coldefs[0].display_name);
        chart.renderVerticalGridLines(x.gridLine_enabled);
        xAxis.ticks(data.length);
        adjustTicksIfNeeded(xAxis, chart.width(), minPixelsPerTick);

        // unfortunately with ordinal axis you can't rely on xAxis.ticks(num) to control the display of labels
        // so instead if we want to display fewer ticks than our full set we need to calculate visibleTicks()
        let numTicks = typeof xAxis.ticks().length !== 'undefined' ? xAxis.ticks()[0] : xAxis.ticks();
        if (numTicks < data.length) {
            let keyInterval = Math.round(keys.length / numTicks);
            let visibleKeys = [];
            for (let i = 0; i < keys.length; i++) {
                if (i % keyInterval === 0) {
                    visibleKeys.push(keys[i]);
                }
            }

            xAxis.tickValues(visibleKeys);
        }
        xAxis.tickFormat(d => formatValue(d, coldefs[0]));
    } else {
        xAxis.ticks(0);
        xAxis.tickFormat('');
    }

    chart.x(d3.scale.ordinal().domain(keys))
        .xUnits(dc.units.ordinal);
}

function applyChartYAxis(chart, card, coldefs, data, minPixelsPerTick) {
    // apply some simple default settings for a y-axis
    // NOTE: this code assumes that the data is an array of arrays and data[rowIdx][1] is our y-axis data

    let settings = card.visualization_settings;
    let y = settings.yAxis;
    let yAxis = chart.yAxis();

    if (y.labels_enabled) {
        chart.yAxisLabel((y.title_text || null) || coldefs[1].display_name);
        chart.renderHorizontalGridLines(true);

        if (y.min || y.max) {
            // if the user wants explicit settings on the y-axis then we need to do some calculations
            let yDomain = getMinMax(data, 1);  // 1 is the array index in the data to use
            if (yDomain[0] > 0) yDomain[0] = 0;
            if (y.min) yDomain[0] = y.min;
            if (y.max) yDomain[1] = y.max;

            chart.y(d3.scale.linear().domain(yDomain));
        } else {
            // by default we let dc.js handle our y-axis
            chart.elasticY(true);
        }

        // Very small charts (i.e., Dashboard Cards) tend to render with an excessive number of ticks
        // set some limits on the ticks per pixel and adjust if needed
        adjustTicksIfNeeded(yAxis, chart.height(), minPixelsPerTick);
    } else {
        yAxis.ticks(0);
    }
}

function applyChartColors(chart, card) {
    // Set the color for the bar/line
    let settings = card.visualization_settings;
    let chartColor = (card.display === 'bar') ? settings.bar.color : settings.line.lineColor;
    let colorList = (card.display === 'bar') ? settings.bar.colors : settings.line.colors;
    // dedup colors list to ensure stacked charts don't have the same color
    let uniqueColors = _.uniq([chartColor].concat(colorList));
    return chart.ordinalColors(uniqueColors);
}

function applyChartTooltips(chart, element, card, cols) {
    chart.on('renderlet', function(chart) {
        // Remove old tooltips which are sometimes not removed due to chart being rerendered while tip is visible
        Array.prototype.forEach.call(document.querySelectorAll('.ChartTooltip--'+element.id), (t) => t.parentNode.removeChild(t));

        let tip = d3.tip()
            .attr('class', 'ChartTooltip ChartTooltip--'+element.id)
            .direction('n')
            .offset([-10, 0])
            .html(function(d) {
                let values = formatNumber(d.data.value);
                if (card.display === 'pie') {
                    // TODO: this is not the ideal way to calculate the percentage, but it works for now
                    values += " (" + formatNumber((d.endAngle - d.startAngle) / Math.PI * 50) + '%)'
                }
                return '<div><span class="ChartTooltip-name">' + formatValue(d.data.key, cols[0]) + '</span></div>' +
                    '<div><span class="ChartTooltip-value">' + values + '</span></div>';
            });

        chart.selectAll('rect.bar,circle.dot,g.pie-slice path,circle.bubble,g.row rect')
            .call(tip)
            .on('mouseover.tip', (slice) => {
                tip.show.apply(tip, arguments);
                if (card.display === "pie") {
                    let tooltip = d3.select('.ChartTooltip--'+element.id);
                    let tooltipOffset = getTooltipOffset(tooltip);
                    let sliceCentroid = getPieSliceCentroid(this, slice);
                    tooltip.style({
                        top: tooltipOffset.y + sliceCentroid.y + "px",
                        left: tooltipOffset.x + sliceCentroid.x + "px",
                        "pointer-events": "none" // d3-tip forces "pointer-events: all" which cases flickering when the tooltip is under the cursor
                    });
                }
            })
            .on('mouseleave.tip', tip.hide);

        chart.selectAll('title').remove();
    });
}

function getPieSliceCentroid(element, slice) {
    let parent = element.parentNode.parentNode;
    let radius = parent.getBoundingClientRect().height / 2;
    let innerRadius = 0;

    let centroid = d3.svg.arc()
        .outerRadius(radius).innerRadius(innerRadius)
        .padAngle(slice.padAngle).startAngle(slice.startAngle).endAngle(slice.endAngle)
        .centroid();

    let pieRect = parent.getBoundingClientRect();

    return {
        x: pieRect.left + radius + centroid[0],
        y: pieRect.top + radius + centroid[1]
    };
}

function getScrollOffset() {
    let doc = document.documentElement;
    let left = (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0);
    let top = (window.pageYOffset || doc.scrollTop)  - (doc.clientTop || 0);
    return { left, top }
}

function getTooltipOffset(tooltip) {
    let tooltipRect = tooltip[0][0].getBoundingClientRect();
    let scrollOffset = getScrollOffset();
    return {
        x: -tooltipRect.width / 2 + scrollOffset.left,
        y: -tooltipRect.height - 30 + scrollOffset.top
    };
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
        let customizeX = customizer(svg.select('.x-axis-label')[0][0]);
        customizeX('fill', x.title_color);
        customizeX('font-size', x.title_font_size);
    } catch (e) {}

    // y-axis label customizations
    try {
        let customizeY = customizer(svg.select('.y-axis-label')[0][0]);
        customizeY('fill', y.title_color);
        customizeY('font-size', y.title_font_size);
    } catch (e) {}

    // grid lines - .grid-line .horizontal, .vertical
    try {
        let customizeVertGL = customizer(svg.select('.grid-line.vertical')[0][0].children);
        customizeVertGL('stroke-width', x.gridLineWidth);
        customizeVertGL('style', x.gridLineColor, (colorStr) => 'stroke:' + colorStr + ';');
    } catch (e) {}
    try {
        let customizeHorzGL = customizer(svg.select('.grid-line.horizontal')[0][0].children);
        customizeHorzGL('stroke-width', y.gridLineWidth);
        customizeHorzGL('style', y.gridLineColor, (colorStr) => 'stroke:' + '#ddd' + ';');

    } catch (e) {}

    // adjust the margins to fit the Y-axis tick label sizes, and rerender
    chart.margins().left = chart.select(".axis.y")[0][0].getBBox().width + 20;
    chart.render();
}

export let CardRenderer = {
    pie(element, card, result) {
        let settings = card.visualization_settings;
        let data = result.rows.map(row => ({
            key: row[0],
            value: row[1]
        }));
        let sumTotalValue = data.reduce((acc, d) => acc + d.value, 0);

        // TODO: by default we should set a max number of slices of the pie and group everything else together

        // build crossfilter dataset + dimension + base group
        let dataset = crossfilter(data);
        let dimension = dataset.dimension(d => d.key);
        let group = dimension.group().reduceSum(d => d.value);
        let chart = initializeChart(card, element)
                        .dimension(dimension)
                        .group(group)
                        .colors(settings.pie.colors)
                        .colorCalculator((d, i) => settings.pie.colors[((i * 5) + Math.floor(i / 5)) % settings.pie.colors.length])
                        .label(row => formatValue(row.key, result.cols[0]))
                        .title(d => {
                            // ghetto rounding to 1 decimal digit since Math.round() doesn't let
                            // you specify a precision and always rounds to int
                            let percent = Math.round((d.value / sumTotalValue) * 1000) / 10.0;
                            return d.key + ': ' + d.value + ' (' + percent + '%)';
                        });

        // disables ability to select slices
        chart.filter = () => {};

        applyChartTooltips(chart, element, card, result.cols);

        chart.render();
    },

    lineAreaBar(element, card, result, chartType) {
        let isTimeseries = dimensionIsTimeseries(result);
        let isMultiSeries = result.cols && result.cols.length > 2;

        // validation.  we require at least 2 rows for bar charting
        if (result.cols.length < 2) {
            return;
        }

        // pre-process data
        let data = result.rows.map(row => {
            // IMPORTANT: clone the data if you are going to modify it in any way
            let tuple = row.slice(0);
            tuple[0] = (isTimeseries) ? new Date(row[0]) : row[0];
            return tuple;
        });

        // build crossfilter dataset + dimension + base group
        let dataset = crossfilter(data);
        let dimension = dataset.dimension(d => d[0]);
        let group = dimension.group().reduceSum(d => d[1]);
        let chart = initializeChart(card, element)
                        .dimension(dimension)
                        .group(group)
                        .valueAccessor(d => d.value);

        // apply any stacked series if applicable
        if (isMultiSeries) {
            chart.stack(dimension.group().reduceSum(d => d[2]));

            // to keep things sane, draw the line at 2 stacked series
            // putting more than 3 series total on the same chart is a lot
            if (result.cols.length > 3) {
                chart.stack(dimension.group().reduceSum(d => d[3]));
            }
        }

        // x-axis settings
        // TODO: we should support a linear (numeric) x-axis option
        if (isTimeseries) {
            applyChartTimeseriesXAxis(chart, card, result.cols, data);
        } else {
            applyChartOrdinalXAxis(chart, card, result.cols, data, MIN_PIXELS_PER_TICK.x);
        }

        // y-axis settings
        // TODO: if we are multi-series this could be split axis
        applyChartYAxis(chart, card, result.cols, data, MIN_PIXELS_PER_TICK.y);

        applyChartTooltips(chart, element, card, result.cols);
        applyChartColors(chart, card);

        // if the chart supports 'brushing' (brush-based range filter), disable this since it intercepts mouse hovers which means we can't see tooltips
        if (chart.brushOn) {
            chart.brushOn(false);
        }

        // LINE/AREA:
        // for chart types that have an 'interpolate' option (line/area charts), enable based on settings
        if (chart.interpolate && card.visualization_settings.line.step) {
            chart.interpolate("step");
        }
        if (chart.renderArea) {
            chart.renderArea(chartType === "area");
        }

        // BAR:
        if (chart.barPadding) {
            chart.barPadding(0.2);
        }

        chart.render();

        // apply any on-rendering functions
        lineAndBarOnRender(chart, card);
    },

    multiLineAreaBar(element, series, chartType) {
        const COLORS = ["#4A90E2", "#84BB4C", "#F9CF48", "#ED6E6E", "#885AB1"];
        const BAR_PADDING_RATIO = 0.2;

        let { card, data: result } = series[0];

        let isTimeseries = dimensionIsTimeseries(result);
        let isStacked = chartType === "area";
        let isLinear = false;

        // validation.  we require at least 2 rows for line charting
        if (result.cols.length < 2) {
            return;
        }

        // pre-process data
        let data = result.rows.map((row) => {
            // IMPORTANT: clone the data if you are going to modify it in any way
            let tuple = row.slice(0);
            tuple[0] = (isTimeseries) ? new Date(row[0]) : row[0];
            return tuple;
        });

        // build crossfilter dataset + dimension + base group
        let dataset = crossfilter();
        series.map((s, index) =>
            dataset.add(s.data.rows.map(row => ({
                x: (isTimeseries) ? new Date(row[0]) : row[0],
                ["y"+index]: row[1]
            })))
        );

        let dimension = dataset.dimension(d => d.x);
        let groups = series.map((s, index) =>
            dimension.group().reduceSum(d => (d["y"+index] || 0))
        );

        let chart;
        if (isStacked || series.length === 1) {
            chart = initializeChart(series[0].card, element)
                        .dimension(dimension)
                        .group(groups[0]);

            // apply any stacked series if applicable
            console.log("groups", groups)
            for (let i = 1; i < groups.length; i++) {
                chart.stack(groups[i]);
            }

            if (chart.renderArea) {
                chart.renderArea(chartType === "area");
            }

            applyChartTooltips(chart, element, card, result.cols);
            // applyChartColors(chart, card);
            chart.ordinalColors(COLORS);

            // BAR:
            if (chart.barPadding) {
                chart.barPadding(BAR_PADDING_RATIO);
            }
        } else {
            chart = initializeChart(card, element, "compositeChart")

            let subCharts = series.map(s =>
                dc[getDcjsChartType(series[0].card.display)](chart)
            );

            subCharts.forEach((subChart, index) => {
                subChart
                    .dimension(dimension)
                    .group(groups[index])
                    .colors(COLORS[index % COLORS.length])
                // BAR:
                if (subChart.barPadding) {
                    subChart
                        .barPadding(BAR_PADDING_RATIO)
                        .centerBar(isLinear)
                }
                // LINE:
                if (subChart.interpolate && card.visualization_settings.line.step) {
                    subChart.interpolate("step");
                }
            });

            chart
                .compose(subCharts)
                .on("renderlet.groupedbar", function (chart) {
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

            // HACK: compositeChart + ordinal X axis shenanigans
            if (chartType === "bar") {
                chart._rangeBandPadding(BAR_PADDING_RATIO) // https://github.com/dc-js/dc.js/issues/678
            } else {
                chart._rangeBandPadding(1) // https://github.com/dc-js/dc.js/issues/662
            }
        }

        // x-axis settings
        // TODO: we should support a linear (numeric) x-axis option
        if (isTimeseries) {
            applyChartTimeseriesXAxis(chart, card, result.cols, data);
        } else {
            applyChartOrdinalXAxis(chart, card, result.cols, data, MIN_PIXELS_PER_TICK.x);
        }

        // y-axis settings
        // TODO: if we are multi-series this could be split axis
        applyChartYAxis(chart, card, result.cols, data, MIN_PIXELS_PER_TICK.y);

        // if the chart supports 'brushing' (brush-based range filter), disable this since it intercepts mouse hovers which means we can't see tooltips
        if (chart.brushOn) {
            chart.brushOn(false);
        }

        // disable transitions
        chart.transitionDuration(0);

        // render
        chart.render();

        // apply any on-rendering functions
        lineAndBarOnRender(chart, card);
    },

    bar(element, card, data, series) {
        if (series && series.length > 0) {
            series = [{ card, data }].concat(series);
            return CardRenderer.multiLineAreaBar(element, series, "bar");
        } else {
            return CardRenderer.lineAreaBar(element, card, data, "bar");
        }
    },

    line(element, card, data, series) {
        if (series && series.length > 0) {
            series = [{ card, data }].concat(series);
            return CardRenderer.multiLineAreaBar(element, series, "line");
        } else {
            return CardRenderer.lineAreaBar(element, card, data, "line");
        }
    },

    area(element, card, data, series) {
        if (series && series.length > 0) {
            series = [{ card, data }].concat(series);
            return CardRenderer.multiLineAreaBar(element, series, "area");
        } else {
            return CardRenderer.lineAreaBar(element, card, data, "area");
        }
    },

    state(element, card, result) {
        let chartData = result.rows.map(value => ({
            stateCode: value[0],
            value: value[1]
        }));

        let chartRenderer = new GeoHeatmapChartRenderer(element, card, result)
            .setData(chartData, 'stateCode', 'value')
            .setJson('/app/charts/us-states.json', d => d.properties.name)
            .setProjection(d3.geo.albersUsa())
            .customize(chart => {
                // text that appears in tooltips when hovering over a state
                chart.title(d => "State: " + d.key + "\nValue: " + (d.value || 0));
            })
            .render();

        return chartRenderer;
    },

    country(element, card, result) {
        let chartData = result.rows.map(value => {
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

        let chartRenderer = new GeoHeatmapChartRenderer(element, card, result)
            .setData(chartData, 'code', 'value')
            .setJson('/app/charts/world.json', d => d.properties.ISO_A2) // 2-letter country code
            .setProjection(d3.geo.mercator())
            .customize(chart => {
                chart.title(d => "Country: " + d.key + "\nValue: " + (d.value || 0));
            })
            .render();

        return chartRenderer;
    },

    pin_map(element, card, updateMapCenter, updateMapZoom) {
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
