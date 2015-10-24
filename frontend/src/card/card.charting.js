/*global google*/

import _ from "underscore";
import crossfilter from 'crossfilter';
import d3 from 'd3';
import dc from 'dc';
import moment from 'moment';

import { formatNumber, formatValueString } from "metabase/lib/formatting";

import tip from 'd3-tip';
tip(d3);

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

var DEFAULT_CARD_WIDTH = 900,
    DEFAULT_CARD_HEIGHT = 500;

var MIN_PIXELS_PER_TICK = {
    x: 100,
    y: 50
};

/// return pair of [min, max] values from items in array DATA, using VALUEACCESSOR to retrieve values for each item
/// VALUEACCESSOR may be an accessor function like fn(ITEM) or can be a string/integer key/index into ITEM which will
/// use a function like fn(item) { return item(KEY); }
function getMinMax(data, valueAccessor) {
    if (typeof valueAccessor === 'string' || typeof valueAccessor === 'number') {
        var key = valueAccessor;
        valueAccessor = function(d) {
            return d[key];
        };
    }

    var values = _.map(data, valueAccessor);
    return _.reduce(values, function(acc, val) {
        var min = acc[0],
            max = acc[1];
        return [
            min < val ? min : val,
            max > val ? max : val
        ];
    }, [values[0], values[0]]);
}

// investigate the response from a dataset query and determine if the dimension is a timeseries
function dimensionIsTimeseries(result) {
    var hasDateField = (result.cols !== undefined &&
                            result.cols.length > 0 &&
                            (result.cols[0].base_type === "DateField")) ? true : false;

    var isDateFirstVal = false;
    if (result.rows !== undefined &&
            result.rows.length > 0 &&
            result.rows[0].length > 0 &&
            !(!isNaN(parseFloat(result.rows[0][0])) && isFinite(result.rows[0][0]))) {
        isDateFirstVal = ( (new Date(result.rows[0][0]) !== "Invalid Date" && !isNaN(new Date(result.rows[0][0])) ));
    }

    return (hasDateField || isDateFirstVal);
}

/// return the Element ID that should be used to find chart with a given chartId
function chartElementIdForId(chartId) {
    return 'card-inner--' + chartId;
}

/// return the DOM element where chart with CHARTID
function chartElementForId(chartId) {
    return document.getElementById(chartElementIdForId(chartId));
}

// return computed property of element or element with ID. Returns null if element is not found
function getComputedProperty(prop, elementOrId) {
    if (typeof elementOrId === 'string') elementOrId = document.getElementById(elementOrId);
    if (!elementOrId) return null;
    return document.defaultView.getComputedStyle(elementOrId, null).getPropertyValue(prop);
}

// computed size properties (drop 'px' and convert string -> Number)
function getComputedSizeProperty(prop, elementOrId) {
    var val = getComputedProperty(prop, elementOrId);
    if (!val) return null;
    return Number(val.replace("px", ""));
}
var getComputedWidth = _.partial(getComputedSizeProperty, "width");
var getComputedHeight = _.partial(getComputedSizeProperty, "height");

function adjustTicksIfNeeded(axis, axisSize, minPixelsPerTick) {
    var numTicks = axis.ticks();
    // d3.js is dumb and sometimes numTicks is a number like 10 and other times it is an Array like [10]
    // if it's an array then convert to a num
    numTicks = typeof numTicks.length !== 'undefined' ? numTicks[0] : numTicks;

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

function initializeChart(card, elementId, defaultWidth, defaultHeight, chartType) {
    chartType = (chartType) ? chartType : getDcjsChartType(card.display);

    // create the chart
    var chart = dc[chartType]('#' + chartElementIdForId(elementId));

    // set width and height
    chart = applyChartBoundary(chart, card, elementId, defaultWidth, defaultHeight);

    // specify legend
    chart = applyChartLegend(chart, card);

    // disable animations
    chart.transitionDuration(0);

    // set card title
    setCardTitle(card, elementId);

    return chart;
}

function applyChartBoundary(dcjsChart, card, elementId, defaultWidth, defaultHeight) {
    return dcjsChart
            .width(CardRenderer.getAvailableCanvasWidth(elementId, card) || defaultWidth)
            .height(CardRenderer.getAvailableCanvasHeight(elementId, card) || defaultHeight);
}

function applyChartLegend(dcjsChart, card) {
    // ENABLE LEGEND IF SPECIFIED IN VISUALIZATION SETTINGS
    // I'm sure it made sense to somebody at some point to make this setting live in two different places depending on the type of chart.
    var settings = card.visualization_settings,
        legendEnabled = false;

    if (card.display === "pie" && settings.pie) {
        legendEnabled = settings.pie.legend_enabled;
    } else if (settings.chart) {
        legendEnabled = settings.chart.legend_enabled;
    }

    if (legendEnabled) {
        return dcjsChart.legend(dc.legend());
    } else {
        return dcjsChart;
    }
}

function setCardTitle(card, elementId) {
    // SET THE CARD TITLE if applicable (probably not, since there's no UI to set this AFAIK)
    var settings = card.visualization_settings,
        chartTitle = settings.global.title;
    if (chartTitle) {
        var titleElement = document.getElementById('card-title--' + elementId);
        if (titleElement) {
            titleElement.innerText = chartTitle;
        }
    }
}

function applyChartTimeseriesXAxis(chart, card, coldefs, data) {
    // setup an x-axis where the dimension is a timeseries

    var x = card.visualization_settings.xAxis,
        xAxis = chart.xAxis(),
        xDomain = getMinMax(data, 0);

    // set the axis label
    if (x.labels_enabled) {
        chart.xAxisLabel((x.title_text || null) || coldefs[0].display_name);
        chart.renderVerticalGridLines(x.gridLine_enabled);

        if (coldefs[0] && coldefs[0].unit) {
            xAxis.tickFormat(d => formatValueString(d, coldefs[0]));
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
        var interval = computeTimeseriesTicksInterval(data, coldefs[0], chart.width(), MIN_PIXELS_PER_TICK.x);
        xAxis.ticks(d3.time[interval.interval], interval.count);
    } else {
        xAxis.ticks(0);
    }

    // calculate the x-axis domain
    chart.x(d3.time.scale().domain(xDomain));
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
    var values = [];
    var index = TIMESERIES_INTERVALS.length;
    for (var row of data) {
        // Only need to check more granular than the current interval
        for (var i = 0; i < TIMESERIES_INTERVALS.length && i < index; i++) {
            var interval = TIMESERIES_INTERVALS[i];
            var value = interval.testFn(row[0]);
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

    var keys = _.map(data, function(d) {
            return d[0];
        });

    var x = card.visualization_settings.xAxis,
        xAxis = chart.xAxis();

    if (x.labels_enabled) {
        chart.xAxisLabel((x.title_text || null) || coldefs[0].display_name);
        chart.renderVerticalGridLines(x.gridLine_enabled);
        xAxis.ticks(data.length);
        adjustTicksIfNeeded(xAxis, chart.width(), minPixelsPerTick);

        // unfortunately with ordinal axis you can't rely on xAxis.ticks(num) to control the display of labels
        // so instead if we want to display fewer ticks than our full set we need to calculate visibleTicks()
        var numTicks = typeof xAxis.ticks().length !== 'undefined' ? xAxis.ticks()[0] : xAxis.ticks();
        if (numTicks < data.length) {
            var keyInterval = Math.round(keys.length / numTicks),
                visibleKeys = [];
            for (var i = 0; i < keys.length; i++) {
                if (i % keyInterval === 0) {
                    visibleKeys.push(keys[i]);
                }
            }

            xAxis.tickValues(visibleKeys);
        }
        xAxis.tickFormat(d => formatValueString(d, coldefs[0]));
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

    var settings = card.visualization_settings,
        y = settings.yAxis,
        yAxis = chart.yAxis();

    if (y.labels_enabled) {
        chart.yAxisLabel((y.title_text || null) || coldefs[1].display_name);
        chart.renderHorizontalGridLines(true);

        if (y.min || y.max) {
            // if the user wants explicit settings on the y-axis then we need to do some calculations
            var yDomain = getMinMax(data, 1);  // 1 is the array index in the data to use
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

function applyChartColors(dcjsChart, card) {
    // Set the color for the bar/line
    let settings = card.visualization_settings;
    let chartColor = (card.display === 'bar') ? settings.bar.color : settings.line.lineColor;
    let colorList = (card.display === 'bar') ? settings.bar.colors : settings.line.colors;
    // dedup colors list to ensure stacked charts don't have the same color
    let uniqueColors = _.uniq([chartColor].concat(colorList));
    return dcjsChart.ordinalColors(uniqueColors);
}

function applyChartTooltips(dcjsChart, card, cols) {
    dcjsChart.on('renderlet', function(chart) {
        // Remove old tooltips which are sometimes not removed due to chart being rerendered while tip is visible
        // We should only ever have one tooltip on screen, right?
        Array.prototype.forEach.call(document.querySelectorAll('.ChartTooltip'), (t) => t.parentNode.removeChild(t));

        var tip = d3.tip()
            .attr('class', 'ChartTooltip')
            .direction('n')
            .offset([-10, 0])
            .html(function(d) {
                var values = formatNumber(d.data.value);
                if (card.display === 'pie') {
                    // TODO: this is not the ideal way to calculate the percentage, but it works for now
                    values += " (" + formatNumber((d.endAngle - d.startAngle) / Math.PI * 50) + '%)'
                }
                return '<div><span class="ChartTooltip-name">' + formatValueString(d.data.key, cols[0]) + '</span></div>' +
                    '<div><span class="ChartTooltip-value">' + values + '</span></div>';
            });

        chart.selectAll('rect.bar,circle.dot,g.pie-slice path,circle.bubble,g.row rect')
            .call(tip)
            .on('mouseover.tip', function(slice) {
                tip.show.apply(tip, arguments);
                if (card.display === "pie") {
                    var tooltip = d3.select('.ChartTooltip');
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
    var parent = element.parentNode.parentNode;
    var radius = parent.getBoundingClientRect().height / 2;
    var innerRadius = 0;

    var centroid = d3.svg.arc()
        .outerRadius(radius).innerRadius(innerRadius)
        .padAngle(slice.padAngle).startAngle(slice.startAngle).endAngle(slice.endAngle)
        .centroid();

    var pieRect = parent.getBoundingClientRect();

    return {
        x: pieRect.left + radius + centroid[0],
        y: pieRect.top + radius + centroid[1]
    };
}

function getTooltipOffset(tooltip) {
    var tooltipRect = tooltip[0][0].getBoundingClientRect();
    return {
        x: -tooltipRect.width / 2,
        y: -tooltipRect.height - 30
    };
}

function lineAndBarOnRender(dcjsChart, card) {
    // once chart has rendered and we can access the SVG, do customizations to axis labels / etc that you can't do through dc.js
    var svg = dcjsChart.svg(),
        settings = card.visualization_settings,
        x = settings.xAxis,
        y = settings.yAxis;

    /// return a function to set attrName to attrValue for element(s) if attrValue is not null
    /// optional ATTRVALUETRANSFORMFN can be used to modify ATTRVALUE before it is set
    var customizer = function(element) {
        return function(attrName, attrValue, attrValueTransformFn) {
            if (attrValue) {
                if (typeof attrValueTransformFn !== 'undefined') {
                    attrValue = attrValueTransformFn(attrValue);
                }
                if (typeof element.length !== 'undefined') {
                    var len = element.length;
                    for (var i = 0; i < len; i++) {
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
        var customizeX = customizer(svg.select('.x-axis-label')[0][0]);
        customizeX('fill', x.title_color);
        customizeX('font-size', x.title_font_size);
    } catch (e) {}

    // y-axis label customizations
    try {
        var customizeY = customizer(svg.select('.y-axis-label')[0][0]);
        customizeY('fill', y.title_color);
        customizeY('font-size', y.title_font_size);
    } catch (e) {}

    // grid lines - .grid-line .horizontal, .vertical
    try {
        var customizeVertGL = customizer(svg.select('.grid-line.vertical')[0][0].children);
        customizeVertGL('stroke-width', x.gridLineWidth);
        customizeVertGL('style', x.gridLineColor, function(colorStr) {
            return 'stroke:' + colorStr + ';';
        });
    } catch (e) {}
    try {
        var customizeHorzGL = customizer(svg.select('.grid-line.horizontal')[0][0].children);
        customizeHorzGL('stroke-width', y.gridLineWidth);
        customizeHorzGL('style', y.gridLineColor, function(colorStr) {
            return 'stroke:' + '#ddd' + ';';
        });

    } catch (e) {}

    // adjust the margins to fit the Y-axis tick label sizes, and rerender
    dcjsChart.margins().left = dcjsChart.select(".axis.y")[0][0].getBBox().width + 20;
    dcjsChart.render();
}


/// ChartRenderer and its various subclasses take care of adjusting settings for different types of charts
///
/// Class Hierarchy:
/// + ChartRenderer
/// +--- pie chart
/// \--+ GeoHeatmapChartRenderer
///    +--- state heatmap
///    \--- country heatmap
///
/// The general rendering looks something like this [for a bar chart]:
/// 1) Call GeoHeatmapChartRenderer(...)
///     2) Code in ChartRenderer(...) runs and does setup common across all charts
///     3) Code in GeoHeatmapChartRenderer(...) runs and does setup common across the charts
/// 4) Further customizations specific to bar charts take place in .customize()
function ChartRenderer(id, card, result, chartType) {
    // ------------------------------ CONSTANTS ------------------------------ //
    var DEFAULT_CARD_WIDTH = 900,
        DEFAULT_CARD_HEIGHT = 500;

    // ------------------------------ PROPERTIES ------------------------------ //
    this.id = id;
    this.card = card;
    this.result = result;
    this.chartType = chartType;

    this.settings = this.card.visualization_settings;

    // ------------------------------ METHODS ------------------------------ //
    this.setData = function(data, dimensionFn, groupFn) {
        this.data = data;

        // as a convenience create dimensionFn/groupFn if a string key or int index is passed in instead of a fn
        if (typeof dimensionFn === 'string' || typeof dimensionFn === 'number') {
            var dimensionKey = dimensionFn;
            dimensionFn = function(d) {
                return d[dimensionKey];
            };
        }
        if (typeof groupFn === 'string' || typeof groupFn === 'number') {
            var groupKey = groupFn;
            groupFn = function(d) {
                return d[groupKey];
            };
        }

        this.dimension = crossfilter(data).dimension(dimensionFn);
        this.group = this.dimension.group().reduceSum(groupFn);

        this.chart.dimension(this.dimension)
            .group(this.group);

        return this;
    };

    /// Provides an opportunity to customize the underlying dc.js chart object directly without breaking our pretty Fluent API flow.
    /// fn gets called as follows: fn(chart)
    /// Use it to do things like chart.projection() (etc.)
    /// fluent API - returns self
    this.customize = function(customizationFunction) {
        customizationFunction(this.chart);
        return this;
    };

    /// register a new callback to be called after this.chart.render() completes
    /// TODO - Use of this can probably be replaced with dc.js chart.on('postRender', function(chart){ ... })
    this._onRenderFns = [];
    this.onRender = function(onRenderFn) {
        this._onRenderFns.push(onRenderFn);
        return this; // fluent API <3
    };

    /// render the chart owned by this ChartRenderer. This should be the final call made in the fluent API call chain
    this.render = function() {
        this.chart.render();
        var numFns = this._onRenderFns.length;
        for (var i = 0; i < numFns; i++) {
            this._onRenderFns[i].call(this);
        }
    };

    // ------------------------------ INTERNAL METHODS ------------------------------ //

    /// determine what width we should use for the chart - we can look at size of the card header / footer and match that
    this._getWidth = function() {
        return CardRenderer.getAvailableCanvasWidth(this.id, this.card) || DEFAULT_CARD_WIDTH;
    };

    /// height available to card for the chart, if available. Equal to height of card minus heights of header + footer.
    this._getHeight = function() {
        return CardRenderer.getAvailableCanvasHeight(this.id, this.card) || DEFAULT_CARD_HEIGHT;
    };

    // ------------------------------ INITIALIZATION ------------------------------ //
    this.chartFn = dc[this.chartType]; // e.g. dc['geoChoroplethChart]
    this.chart = this.chartFn('#' + chartElementIdForId(this.id))
        .width(this._getWidth())
        .height(this._getHeight());

    // ENABLE LEGEND IF SPECIFIED IN VISUALIZATION SETTINGS
    // I'm sure it made sense to somebody at some point to make this setting live in two different places depending on the type of chart.
    var legendEnabled = chartType === 'pieChart' ? this.settings.pie.legend_enabled : this.settings.chart.legend_enabled;
    if (legendEnabled) this.chart.legend(dc.legend());

    // SET THE CARD TITLE if applicable (probably not, since there's no UI to set this AFAIK)
    var chartTitle = this.settings.global.title;
    if (chartTitle) {
        var titleElement = document.getElementById('card-title--' + id);
        if (titleElement) {
            titleElement.innerText = chartTitle;
        }
    }
}

function GeoHeatmapChartRenderer(id, card, result) {
    // ------------------------------ CONSTANTS ------------------------------ //
    /// various shades that should be used in State + World Heatmaps
    /// TODO - These colors are from the dc.js examples and aren't the same ones we used on highcharts. Do we want custom Metabase colors?
    var HEAT_MAP_COLORS = d3.scale.quantize().range([
            "#E2F2FF",
            "#C4E4FF",
            "#9ED2FF",
            "#81C5FF",
            "#6BBAFF",
            "#51AEFF",
            "#36A2FF",
            "#1E96FF",
            "#0089FF",
            "#0061B5"
        ]),
        /// color to use when a state/country has a value of zero
        HEAT_MAP_ZERO_COLOR = '#CCC';

    // ------------------------------ SUPERCLASS INIT ------------------------------ //
    ChartRenderer.call(this, id, card, result, 'geoChoroplethChart');

    // ------------------------------ METHODS ------------------------------ //
    this.superSetData = this.setData;
    this.setData = function(data, dimension, groupFn) {
        this.superSetData(data, dimension, groupFn);
        this.chart.colorDomain(getMinMax(this.data, 'value'));
        return this;
    };

    /// store path to JSON file and SHAPEKEYFN for later. The JSON will be loaded via d3 when render() is called.
    /// SHAPEKEYFN is a function with signature f(geo_feature) that should return the key that will be used to identify the feature. i.e. country code / state code.
    this.setJson = function(jsonPath, shapeKeyFn) {
        this.jsonPath = jsonPath;
        this.shapeKeyFn = shapeKeyFn;
        return this;
    };

    /// Set the map projection to a d3.geo projection type, and adjust its scale/translation based on available height/width.
    /// We need to do this or the map size won't match the chart size.
    this.setProjection = function(projection) {
        // determine how width/height would need to be adjusted to fit the space available
        // 'translation' of the map is effectively its center so we can use that to determine the width/height of the map at the current scale
        var currentTranslation = projection.translate(),
            currentWidth = currentTranslation[0] * 2.0,
            currentHeight = currentTranslation[1] * 2.0,
            widthMultiplier = this.chart.width() / currentWidth,
            heightMultiplier = this.chart.height() / currentHeight;

        // Now adjust the scale and translation of the projection.
        // Multiply it by the smaller of the width/height multipliers so the entire map will fit in available area
        var scaleMultiplier = widthMultiplier < heightMultiplier ? widthMultiplier : heightMultiplier;
        projection.scale(projection.scale() * scaleMultiplier);
        projection.translate([this.chart.width() / 2.0, this.chart.height() / 2.0]);

        // apply projection to chart
        this.chart.projection(projection);

        return this;
    };

    /// call d3.json to load the JSON in question and call super.render() in the completion lambda
    this.superRender = this.render;
    this.render = function() {
        var renderer = this; // keep reference to self because 'this' is undefined inside the callback lambda
        d3.json(this.jsonPath, function(json) {
            renderer.chart.overlayGeoJson(json.features, 'features', renderer.shapeKeyFn);
            renderer.superRender();
        });
    };

    // ------------------------------ INITIALIZATION ------------------------------ //
    var chart = this.chart; // need ref that can be captured by lambda passed to colorCalculator()
    chart.colors(HEAT_MAP_COLORS)
        .colorCalculator(function(d) {
            return d ? chart.colors()(d) : HEAT_MAP_ZERO_COLOR;
        });
}

export var CardRenderer = {
    /// get the size render settings for card if applicable
    _getSizeSettings: function(cardOrDimension) {
        if (typeof cardOrDimension === "object") {
            if (typeof cardOrDimension.render_settings !== "undefined" &&
                typeof cardOrDimension.render_settings.size !== "undefined") {
                return cardOrDimension.render_settings.size;
            }
        }
        return undefined;
    },

    /// height available for rendering the card
    getAvailableCanvasHeight: function(id, cardOrDimension) {
        var sizeSettings = CardRenderer._getSizeSettings(cardOrDimension),
            initialHeight = sizeSettings ? sizeSettings.initialHeight : undefined;

        if (typeof cardOrDimension === "number") {
            initialHeight = cardOrDimension;
        }

        // if we already have size settings subtract height of header + footer and return
        if (typeof initialHeight !== "undefined") {
            var headerHeight = getComputedHeight(id + '_heading');
            return initialHeight - headerHeight - 5; // why the magic number :/
        }

        // if we can find the chart element in the DOM then max width is parent element - parent x padding
        var chartElement = chartElementForId(id);
        if (chartElement) {
            var parent = chartElement.parentElement,
                parentHeight = getComputedHeight(parent),
                parentPaddingTop = getComputedSizeProperty('padding-top', parent),
                parentPaddingBottom = getComputedSizeProperty('padding-bottom', parent);

            return parentHeight - parentPaddingTop - parentPaddingBottom - 5; // why the magic number :/
        }

        return null;
    },

    /// width available for rendering the card
    getAvailableCanvasWidth: function(id, cardOrDimension) {
        var sizeSettings = CardRenderer._getSizeSettings(cardOrDimension),
            initialWidth = sizeSettings ? sizeSettings.initialWidth : undefined;

        if (typeof cardOrDimension === "number") {
            initialWidth = cardOrDimension;
        }
        if (typeof initalWidth !== 'undefined') return initialWidth;

        // if we can find the chart element in the DOM then max width is parent element - parent x padding
        var chartElement = chartElementForId(id);
        if (chartElement) {
            var parent = chartElement.parentElement,
                parentWidth = getComputedWidth(parent),
                parentPaddingLeft = getComputedSizeProperty('padding-left', parent),
                parentPaddingRight = getComputedSizeProperty('padding-right', parent);

            return parentWidth - parentPaddingLeft - parentPaddingRight;
        }

        // otherwise try to return the width of #CHARTID_heading or null if that fails
        return getComputedWidth(id + '_heading');
    },

    /// set the size of chart/table
    /// called every time a table is displayed, or when charts are resized on a Dashboard
    setSize: function(id, height, width) {
        height = CardRenderer.getAvailableCanvasHeight(id, height);
        width = CardRenderer.getAvailableCanvasWidth(id, width);
        if (height === null) {
            height = 450;
        }
        var el = document.getElementById(id);
        if (el) {
            el.style.height = height + "px";
            if (width !== null) {
                el.style.width = width + "px";
            }
            el.dispatchEvent(new Event("cardrenderer-card-resized"));
        }

        // dynamically resize the chart if applicable
        var chartRootElement = chartElementForId(id);
        if (chartRootElement) {
            // find the dc.js Chart instance for that corresponds to this element
            var chart = _.filter(dc.chartRegistry.list(), function(dcChart) {
                return dcChart.root()[0][0] === chartRootElement;
            })[0];
            // update size, width then re-render the chart
            if (height) chart.height(height);
            if (width) chart.width(width);

            // HACK! pie chart doesn't resize properly unless you also update radius
            if (typeof chart.radius !== 'undefined') chart.radius(Math.min(height, width) / 2);

            chart.render();
        }
    },

    pie: function(id, card, result) {
        var settings = card.visualization_settings,
            data = _.map(result.rows, function(row) {
                return {
                    key: row[0],
                    value: row[1]
                };
            }),
            sumTotalValue = _.reduce(data, function(acc, d) {
                return acc + d.value;
            }, 0);

        // TODO: by default we should set a max number of slices of the pie and group everything else together

        // build crossfilter dataset + dimension + base group
        var dataset = crossfilter(data),
            dimension = dataset.dimension(function(d) {
                            return d.key;
                        }),
            group = dimension.group().reduceSum(function(d) {
                            return d.value;
                        }),
            chart = initializeChart(card, id, DEFAULT_CARD_WIDTH, DEFAULT_CARD_HEIGHT)
                        .dimension(dimension)
                        .group(group)
                        .colors(settings.pie.colors)
                        .colorCalculator((d, i) => settings.pie.colors[((i * 5) + Math.floor(i / 5)) % settings.pie.colors.length])
                        .label(row => formatValueString(row.key, result.cols[0]))
                        .title(function(d) {
                            // ghetto rounding to 1 decimal digit since Math.round() doesn't let
                            // you specify a precision and always rounds to int
                            var percent = Math.round((d.value / sumTotalValue) * 1000) / 10.0;
                            return d.key + ': ' + d.value + ' (' + percent + '%)';
                        });

            // disables ability to select slices
            chart.filter = function() {};

        applyChartTooltips(chart, card, result.cols);

        chart.render();
    },

    bar: function(id, card, result) {
        var isTimeseries = (dimensionIsTimeseries(result)) ? true : false;
        var isMultiSeries = (result.cols !== undefined &&
                                result.cols.length > 2) ? true : false;

        // validation.  we require at least 2 rows for bar charting
        if (result.cols.length < 2) return;

        // pre-process data
        var data = _.map(result.rows, function(row) {
            // IMPORTANT: clone the data if you are going to modify it in any way
            var tuple = row.slice(0);
            tuple[0] = (isTimeseries) ? new Date(row[0]) : row[0];
            return tuple;
        });

        // build crossfilter dataset + dimension + base group
        var dataset = crossfilter(data),
            dimension = dataset.dimension(function(d) {
                            return d[0];
                        }),
            group = dimension.group().reduceSum(function(d) {
                            return d[1];
                        }),
            chart = initializeChart(card, id, DEFAULT_CARD_WIDTH, DEFAULT_CARD_HEIGHT)
                        .dimension(dimension)
                        .group(group)
                        .valueAccessor(function(d) {
                            return d.value;
                        });

        // apply any stacked series if applicable
        if (isMultiSeries) {
            chart.stack(dimension.group().reduceSum(function(d) {
                return d[2];
            }));

            // to keep things sane, draw the line at 2 stacked series
            // putting more than 3 series total on the same chart is a lot
            if (result.cols.length > 3) {
                chart.stack(dimension.group().reduceSum(function(d) {
                    return d[3];
                }));
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

        applyChartTooltips(chart, card, result.cols);
        applyChartColors(chart, card);

        // if the chart supports 'brushing' (brush-based range filter), disable this since it intercepts mouse hovers which means we can't see tooltips
        if (chart.brushOn) chart.brushOn(false);

        // for chart types that have an 'interpolate' option (line/area charts), enable based on settings
        if (chart.interpolate && card.visualization_settings.line.step) chart.interpolate('step');

        chart.barPadding(0.2); // amount of padding between bars relative to bar size [0 - 1.0]. Default = 0
        chart.render();

        // apply any on-rendering functions
        lineAndBarOnRender(chart, card);
    },

    line: function(id, card, result, isAreaChart, isTimeseries) {
        isAreaChart = typeof isAreaChart === undefined ? false : isAreaChart;
        isTimeseries = ((typeof isAreaChart !== undefined && isTimeseries) ||
                            dimensionIsTimeseries(result)) ? true : false;
        var isMultiSeries = (result.cols !== undefined &&
                                result.cols.length > 2) ? true : false;

        // validation.  we require at least 2 rows for line charting
        if (result.cols.length < 2) return;

        // pre-process data
        var data = _.map(result.rows, function(row) {
            // IMPORTANT: clone the data if you are going to modify it in any way
            var tuple = row.slice(0);
            tuple[0] = (isTimeseries) ? new Date(row[0]) : row[0];
            return tuple;
        });

        // build crossfilter dataset + dimension + base group
        var dataset = crossfilter(data),
            dimension = dataset.dimension(function(d) {
                            return d[0];
                        }),
            group = dimension.group().reduceSum(function(d) {
                            return d[1];
                        }),
            chart = initializeChart(card, id, DEFAULT_CARD_WIDTH, DEFAULT_CARD_HEIGHT)
                        .dimension(dimension)
                        .group(group)
                        .valueAccessor(function(d) {
                            return d.value;
                        })
                        .renderArea(isAreaChart);

        // apply any stacked series if applicable
        if (isMultiSeries) {
            chart.stack(dimension.group().reduceSum(function(d) {
                return d[2];
            }));

            // to keep things sane, draw the line at 2 stacked series
            // putting more than 3 series total on the same chart is a lot
            if (result.cols.length > 3) {
                chart.stack(dimension.group().reduceSum(function(d) {
                    return d[3];
                }));
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

        applyChartTooltips(chart, card, result.cols);
        applyChartColors(chart, card);

        // if the chart supports 'brushing' (brush-based range filter), disable this since it intercepts mouse hovers which means we can't see tooltips
        if (chart.brushOn) chart.brushOn(false);

        // for chart types that have an 'interpolate' option (line/area charts), enable based on settings
        if (chart.interpolate && card.visualization_settings.line.step) chart.interpolate('step');

        // render
        chart.render();

        // apply any on-rendering functions
        lineAndBarOnRender(chart, card);
    },

    /// Area Chart is just a Line Chart that we called renderArea(true) on
    /// Defer to CardRenderer.line() and pass param area = true
    area: function(id, card, result) {
        return CardRenderer.line(id, card, result, true);
    },

    /// TimeSeries is really just a Line Chart where the x-axis is time, so
    /// Defer to CardRendered.line() and be explicit that we know timeseries = true
    timeseries: function(id, card, result) {
        return CardRenderer.line(id, card, result, false, true);
    },

    state: function(id, card, result) {
        var chartData = _.map(result.rows, function(value) {
            return {
                stateCode: value[0],
                value: value[1]
            };
        });

        var chartRenderer = new GeoHeatmapChartRenderer(id, card, result)
            .setData(chartData, 'stateCode', 'value')
            .setJson('/app/charts/us-states.json', function(d) {
                return d.properties.name;
            })
            .setProjection(d3.geo.albersUsa())
            .customize(function(chart) {
                // text that appears in tooltips when hovering over a state
                chart.title(function(d) {
                    return "State: " + d.key + "\nValue: " + (d.value || 0);
                });
            })
            .render();

        return chartRenderer;
    },

    country: function(id, card, result) {
        var chartData = _.map(result.rows, function(value) {
            // Does this actually make sense? If country is > 2 characters just use the first 2 letters as the country code ?? (WTF)
            var countryCode = value[0];
            if (typeof countryCode === "string") {
                countryCode = countryCode.substring(0, 2).toUpperCase();
            }

            return {
                code: countryCode,
                value: value[1]
            };
        });

        var chartRenderer = new GeoHeatmapChartRenderer(id, card, result)
            .setData(chartData, 'code', 'value')
            .setJson('/app/charts/world.json', function(d) {
                return d.properties.ISO_A2; // 2-letter country code
            })
            .setProjection(d3.geo.mercator())
            .customize(function(chart) {
                chart.title(function(d) { // tooltip when hovering over a country
                    return "Country: " + d.key + "\nValue: " + (d.value || 0);
                });
            })
            .render();

        return chartRenderer;
    },

    ll_heatmap: function(id, card, result) {
        var mapOptions = {
                zoom: 2,
                center: new google.maps.LatLng(result.average_latitude, result.average_longitude),
                mapTypeId: google.maps.MapTypeId.MAP
            };

        var map = new google.maps.Map(document.getElementById(id), mapOptions);

        var southWest = new google.maps.LatLng(result.min_latitude, result.min_longitude),
            northEast = new google.maps.LatLng(result.max_latitude, result.max_longitude),
            average = new google.maps.LatLng(result.average_latitude, result.average_longitude);

        var bounds = new google.maps.LatLngBounds();
        bounds.extend(southWest);
        bounds.extend(northEast);
        bounds.extend(average);
        map.fitBounds(bounds);

        var pointData = [];
        for (var i = 0; i < result.rows.length; i++) {
            pointData.push(new google.maps.LatLng(result.rows[i][0], result.rows[i][1]));
        }
        var pointArray = new google.maps.MVCArray(pointData);

        var heatmap = new google.maps.visualization.HeatmapLayer({
            data: pointArray,
            radius: 16,
            maxIntensity: 4
        });

        heatmap.setMap(map);
        var height = CardRenderer.getAvailableCanvasHeight(id, card),
            width = CardRenderer.getAvailableCanvasWidth(id, card);
        if (!height) height = 450;

        document.getElementById(id).style.height = height + "px";
        if (width !== null) {
            document.getElementById(id).style.width = width + "px";
        }
    },

    pin_map: function(id, card, updateMapCenter, updateMapZoom) {
        var query = card.dataset_query,
            vs = card.visualization_settings,
            latitude_dataset_col_index = vs.map.latitude_dataset_col_index,
            longitude_dataset_col_index = vs.map.longitude_dataset_col_index,
            latitude_source_table_field_id = vs.map.latitude_source_table_field_id,
            longitude_source_table_field_id = vs.map.longitude_source_table_field_id;

        if (typeof latitude_dataset_col_index === "undefined" || typeof longitude_dataset_col_index === "undefined") return;

        if (latitude_source_table_field_id === null || longitude_source_table_field_id === null) {
            throw ("Map ERROR: latitude and longitude column indices must be specified");
        }
        if (latitude_dataset_col_index === null || longitude_dataset_col_index === null) {
            throw ("Map ERROR: unable to find specified latitude / longitude columns in source table");
        }

        var mapOptions = {
            zoom: vs.map.zoom,
            center: new google.maps.LatLng(vs.map.center_latitude, vs.map.center_longitude),
            mapTypeId: google.maps.MapTypeId.MAP,
            scrollwheel: false
        };

        var markerImageMapType = new google.maps.ImageMapType({
            getTileUrl: function(coord, zoom) {
                return '/api/tiles/' + zoom + '/' + coord.x + '/' + coord.y + '/' +
                    latitude_source_table_field_id + '/' + longitude_source_table_field_id + '/' +
                    latitude_dataset_col_index + '/' + longitude_dataset_col_index + '/' +
                    '?query=' + encodeURIComponent(JSON.stringify(query));
            },
            tileSize: new google.maps.Size(256, 256)
        });

        var height = CardRenderer.getAvailableCanvasHeight(id, card),
            width = CardRenderer.getAvailableCanvasWidth(id, card);

        if (height === null) height = 450;
        document.getElementById(id).style.height = height + "px";

        if (width !== null) {
            document.getElementById(id).style.width = width + "px";
        }

        var map = new google.maps.Map(document.getElementById(id), mapOptions);

        map.overlayMapTypes.push(markerImageMapType);

        map.addListener("center_changed", function() {
            var center = map.getCenter();
            updateMapCenter(center.lat(), center.lng());
        });

        map.addListener("zoom_changed", function() {
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
        document.getElementById(id).addEventListener('cardrenderer-card-resized', function() {
            google.maps.event.trigger(map, 'resize');
        });
    },

    table: function(id, card) {
        // set the size of the table's container to the initial
        // size prescribed by gridster (if applicable).
        if (card.render_settings !== undefined &&
            card.render_settings.size.initialHeight !== 'undefined' &&
            card.render_settings.size.initialWidth !== 'undefined') {
            CardRenderer.setSize(id, card.render_settings.size.initialHeight, card.render_settings.size.initialWidth);
        }
    }
};
