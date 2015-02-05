'use strict';
/*jslint browser:true */
/*global document,$,jQuery,_,google,d3,crossfilter,dc,console,vs*/

// ---------------------------------------- TODO - Maybe. Lots of these things never worked in the first place. ----------------------------------------
// IMPORTANT
// - 'titles' (tooltips)
// - finish removing jQuery
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

/// WTF is this for ????
$.ajaxSetup({
    beforeSend: function(xhr, settings) {
        function getCookie(name) {
            var cookieValue = null;
            if (document.cookie && document.cookie !== '') {
                var cookies = document.cookie.split(';');
                for (var i = 0; i < cookies.length; i++) {
                    var cookie = jQuery.trim(cookies[i]);
                    // Does this cookie string begin with the name we want?
                    if (cookie.substring(0, name.length + 1) == (name + '=')) {
                        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                        break;
                    }
                }
            }
            return cookieValue;
        }
        if (!(/^http:.*/.test(settings.url) || /^https:.*/.test(settings.url))) {
            // Only send the token to relative URLs i.e. locally.
            xhr.setRequestHeader("X-CSRFToken", getCookie('csrftoken'));
        }
    }
});

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
    return Number(val.replace("px", ""));
}
var getComputedWidth = _.partial(getComputedSizeProperty, "width");
var getComputedHeight = _.partial(getComputedSizeProperty, "height");

/// ChartRenderer and its various subclasses take care of adjusting settings for different types of charts
///
/// Class Hierarchy:
/// + ChartRenderer
/// +--- pie chart
/// +--+ BarAndLineChartRenderer
/// |  +--- bar chart
/// |  +--- series chart
/// |  \--+ line chart
/// |     \--- area chart
/// \--+ GeoHeatmapChartRenderer
///    +--- state heatmap
///    \--- country heatmap
///
/// The general rendering looks something like this [for a bar chart]:
/// 1) Call BarAndLineChartRenderer(...)
///     2) Code in ChartRenderer(...) runs and does setup common across all charts
///     3) Code in BarAndLineChartRenderer(...) runs and does setup common across bar and line charts
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

function BarAndLineChartRenderer(id, card, result, chartType) {
    // ------------------------------ SUPERCLASS INIT ------------------------------ //
    ChartRenderer.call(this, id, card, result, chartType);

    // ------------------------------ METHODS ------------------------------ //

    /// Convenience for calculating + setting the range of the x and y axes.
    /// XDOMAIN/YDOMAIN are [min, max] pairs or keys into a row of data.
    /// If a key/index is passed, it will be replaced with a call to getMinMax(self.data, [X|Y]DOMAIN).
    /// In order words, the domain will be the [min, max] values that can be fetched with that key/index.
    ///
    /// Unless overridden by visualization settings, if yMin > 0, 0 will be used as the y minimum.
    /// If the Chart's visualization settings specify min(s)/max(es), those values will be used instead of the supplied values.
    ///
    /// Optionally pass options dict (default values shown): {
    ///     xScaleType: d3.scale.linear,
    ///     yScaleType: d3.scale.linear
    /// }
    this.setXAndYDomains = function(xDomain, yDomain, options) {
        if (typeof xDomain === 'string' || typeof xDomain === 'number') xDomain = getMinMax(this.data, xDomain);
        if (typeof yDomain === 'string' || typeof yDomain === 'number') yDomain = getMinMax(this.data, yDomain);

        if (yDomain[0] > 0) yDomain[0] = 0;
        if (this.settings.xAxis.min) xDomain[0] = this.settings.xAxis.min;
        if (this.settings.xAxis.max) xDomain[1] = this.settings.xAxis.max;
        if (this.settings.yAxis.min) yDomain[0] = this.settings.yAxis.min;
        if (this.settings.yAxis.max) yDomain[1] = this.settings.yAxis.max;

        if (!options) options = {};
        var xScaleType = options.xScaleType || d3.scale.linear,
            yScaleType = options.yScaleType || d3.scale.linear;

        this.chart.x(xScaleType().domain(xDomain))
            .y(yScaleType().domain(yDomain));
        return this;
    };

    /// i.e. if chart is 500 pixels wide we don't want more than 5 ticks
    var MIN_PIXELS_PER_TICK = {
        x: 100,
        y: 50
    };

    /// Determine if d3 AXIS has too many ticks for its height/width and adjust if needed
    this.adjustTicksIfNeeded = function(axis, axisSize, minPixelsPerTick) {
        var numTicks = axis.ticks();
        // d3.js is dumb and sometimes numTicks is a number like 10 and other times it is an Array like [10]
        // if it's an array then convert to a num
        numTicks = typeof numTicks.length !== 'undefined' ? numTicks[0] : numTicks;

        if ((axisSize / numTicks) < minPixelsPerTick) {
            axis.ticks(Math.round(axisSize / minPixelsPerTick));
        }
    };

    /// Specify FORMATFN(tickStr) to provide a custom string for ticks on the x-axis. If x-axis labels are disabled, this call will essentially no-op.
    /// Optionally, specify NUMTICKS for the x-axis.
    /// Prefer this call to calling xAxis().tickFormat() directly since this method checks whether they're enabled in settings.
    this.setXAxisTickFormat = function(formatFn, numTicks) {
        var xAxis = this.chart.xAxis();
        if (!this.settings.xAxis.labels_enabled) {
            xAxis.ticks(0);
            return this;
        }
        xAxis.tickFormat(formatFn);

        if (numTicks) {
            xAxis.ticks(numTicks);
            // double check that we didn't specify too many ticks & fix if need be
            this.adjustTicksIfNeeded(xAxis, this.chart.width(), MIN_PIXELS_PER_TICK.x);
        }
        return this;
    };

    // ------------------------------ INITIALIZATION ------------------------------ //
    // Set the titles for the axes - look for ones specified in settings or fall back to value in result.columns
    var x = this.settings.xAxis,
        y = this.settings.yAxis,
        axisTitle = function(axis) {
            return axis.title_text || null;
        };
    if (x.title_enabled) this.chart.xAxisLabel(axisTitle(x) || result.columns[0]);
    if (y.title_enabled) this.chart.yAxisLabel(axisTitle(y) || result.columns[1]);

    var xAxis = this.chart.xAxis(),
        yAxis = this.chart.yAxis();

    // disable ticks on the x or y axes if !labels_enabled
    // since this call can be overriden by setXAxisTickFormat() we still have to do a check up there too
    if (!x.labels_enabled) xAxis.ticks(0);
    if (!y.labels_enabled) yAxis.ticks(0);

    // Very small charts (i.e., Dashboard Cards) tend to render with an excessive number of ticks
    // set some limits on the ticks per pixel and adjust if needed
    if (x.labels_enabled) this.adjustTicksIfNeeded(xAxis, this.chart.width(), MIN_PIXELS_PER_TICK.x);
    if (y.labels_enabled) this.adjustTicksIfNeeded(yAxis, this.chart.height(), MIN_PIXELS_PER_TICK.y);

    // Enable / disable grid lines. Apparently 'Show gridline' in the UI only affects the xAxis (!)
    this.chart.renderVerticalGridLines(x.gridLine_enabled) // what kind of variableNaming_convention are we trying to follow here ?
        .renderHorizontalGridLines(y.gridLine_enabled);

    // Set the color for the bar/line
    var chartColor = chartType === 'barChart' ? this.settings.bar.color : this.settings.line.lineColor;
    this.chart.ordinalColors([chartColor]);

    // set the title (tooltip) function for points / bars on the chart
    this.chart.title(function(d) {
        return d.key + ": " + d.value;
    });

    // if the chart supports 'brushing' (brush-based range filter), disable this since it intercepts mouse hovers which means we can't see tooltips
    if (this.chart.brushOn) this.chart.brushOn(false);

    // for chart types that have an 'interpolate' option (line/area charts), enable based on settings
    if (this.chart.interpolate && this.settings.line.step) this.chart.interpolate('step');

    // once chart has rendered and we can access the SVG, do customizations to axis labels / etc that you can't do through dc.js
    this.onRender(function() {
        var svg = this.chart.svg();

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
                return 'stroke:' + colorStr + ';';
            });

        } catch (e) {}
    });
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

var CardRenderer = {
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
            $(el).trigger('cardrenderer-card-resized');
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
        var vs = card.visualization_settings,
            numColors = vs.pie.colors.length,
            chartData = _.map(result.rows, function(row) {
                return {
                    key: row[0],
                    value: row[1]
                };
            }),
            keys = _.map(chartData, function(d) {
                return d.key;
            }),
            sumTotalValue = _.reduce(chartData, function(acc, d) {
                return acc + d.value;
            }, 0);

        var chartRenderer = new ChartRenderer(id, card, result, 'pieChart')
            .setData(chartData, 'key', 'value')
            .customize(function(chart) {
                chart.colors(vs.pie.colors)
                    .colorCalculator(function(d) {
                        var index = _.indexOf(keys, d.key);
                        return vs.pie.colors[index % numColors];
                    })
                    .title(function(d) {
                        // ghetto rounding to 1 decimal digit since Math.round() doesn't let you specify a precision and always rounds to int
                        var percent = Math.round((d.value / sumTotalValue) * 1000) / 10.0;
                        return d.key + ': ' + d.value + ' (' + percent + '%)';
                    });
            })
            .render();
    },

    bar: function(id, card, result) {
        // row looks like [false, 523]
        // convert to {index: 0, title: false, value: 523}
        var rowCount = result.rows.length,
            data = [];

        for (var i = 0; i < rowCount; i++) {
            var row = result.rows[i];
            data.push({
                index: i,
                title: String(row[0]),
                value: row[1]
            });
        }

        // we'll keep the labels on the xAxis but we'll actually use the integer index of each row
        var chartRenderer = new BarAndLineChartRenderer(id, card, result, 'barChart')
            .setData(data, 'index', 'value')
            .setXAndYDomains([-0.5, rowCount - 0.5], 'value')
            .customize(function(chart) {
                chart.centerBar(true)
                    .barPadding(1.0); // amount of padding between bars relative to bar size [0 - 1.0]. Default = 0
            })
            .setXAxisTickFormat(function(index) {
                return data[index].title;
            }, rowCount)
            .render();
    },

    line: function(id, card, result, isAreaChart) {
        isAreaChart = typeof isAreaChart === undefined ? false : isAreaChart;

        var data = _.map(result.rows, function(row) {
            return {
                key: row[0],
                value: row[1]
            };
        });

        var chartRenderer = new BarAndLineChartRenderer(id, card, result, 'lineChart')
            .setData(data, 'key', 'value')
            .setXAndYDomains('key', 'value')
            .customize(function(chart) {
                if (isAreaChart) chart.renderArea(true);
            })
            .render();
    },

    /// Area Chart is just a Line Chart that we called renderArea(true) on
    /// Defer to CardRenderer.line() and pass param area = true
    area: function(id, card, result) {
        return CardRenderer.line(id, card, result, true);
    },

    timeseries: function(id, card, result) {
        // rows are pair of dateString, value like ["2014-11-05", 12]
        // convert to { date: Date [x-axis], value: value [y-axis] }
        var data = _.map(result.rows, function(row) {
            var dateStr = row[0],
                value = row[1];
            return {
                date: new Date(dateStr),
                value: value
            };
        });

        var chartRenderer = new BarAndLineChartRenderer(id, card, result, 'seriesChart')
            .setData(data, function(d) {
                // pair of [seriesNum, date (x-axis)]
                // note there's currently only one series so this is always zero
                return [0, d.date];
            }, 'value')
            .setXAndYDomains('date', 'value', {
                xScaleType: d3.time.scale
            })
            // override the d3 date formatter functions with ones that give a little more detail. E.g. "March '15" instead of just "March"
            .setXAxisTickFormat(d3.time.format.multi([
                [".%L", function(d) {
                    return d.getMilliseconds();
                }],
                [":%S", function(d) {
                    return d.getSeconds();
                }],
                ["%I:%M", function(d) {
                    return d.getMinutes();
                }],
                ["%I %p", function(d) {
                    return d.getHours();
                }],
                ["%a %d", function(d) {
                    return d.getDay() && d.getDate() != 1;
                }],
                ["%b %d", function(d) {
                    return d.getDate() != 1;
                }],
                ["%B '%y", function(d) { // default "%B"
                    return d.getMonth();
                }],
                ["%B '%y", function() { // default "%Y"
                    return true;
                }]
            ]))
            .customize(function(chart) {
                chart.seriesAccessor(function(d) { // this is what gets put in the legend, if applicable
                        return d.key[0]; // series #
                    })
                    .keyAccessor(function(d) {
                        return d.key[1]; // date - x-axis
                    })
                    .valueAccessor(function(d) {
                        return d.value; // value - y-axis
                    })
                    .title(function(d) {
                        return d.key[1] + ': ' + d.value;
                    });
            })
            .render();
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
            .setJson('/static/json/us-states.json', function(d) {
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
    },

    country: function(id, card, result) {
        var chartData = _.map(result.rows, function(value) {
            // Does this actually make sense? If country is > 2 characters just use the first 2 letters as the country code ?? (WTF)
            var countryCode = value[0];
            if (countryCode) {
                if (countryCode.length > 2) countryCode = countryCode.substring(0, 2);
                countryCode = countryCode.toUpperCase();
            }
            return {
                code: countryCode,
                value: value[1]
            };
        });

        var chartRenderer = new GeoHeatmapChartRenderer(id, card, result)
            .setData(chartData, 'code', 'value')
            .setJson('/static/json/world.json', function(d) {
                return d.properties.ISO_A2; // 2-letter country code
            })
            .setProjection(d3.geo.mercator())
            .customize(function(chart) {
                chart.title(function(d) { // tooltip when hovering over a country
                    return "Country: " + d.key + "\nValue: " + (d.value || 0);
                });
            })
            .render();
    },

    ll_heatmap: function(id, card, result) {
        var title = card.title,
            mapOptions = {
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
        var title = card.title,
            query = card.dataset_query,
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
        $('#' + id).on('cardrenderer-card-resized', function() {
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
