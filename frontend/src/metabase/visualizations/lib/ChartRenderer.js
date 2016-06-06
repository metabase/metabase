
import { getAvailableCanvasWidth, getAvailableCanvasHeight } from "./utils";

import crossfilter from "crossfilter";
import dc from "dc";

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
export default function ChartRenderer(element, card, result, chartType) {
    // ------------------------------ CONSTANTS ------------------------------ //
    var DEFAULT_CARD_WIDTH = 900,
        DEFAULT_CARD_HEIGHT = 500;

    // ------------------------------ PROPERTIES ------------------------------ //
    this.element = element;
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
        return getAvailableCanvasWidth(this.element) || DEFAULT_CARD_WIDTH;
    };

    /// height available to card for the chart, if available. Equal to height of card minus heights of header + footer.
    this._getHeight = function() {
        return getAvailableCanvasHeight(this.element) || DEFAULT_CARD_HEIGHT;
    };

    // ------------------------------ INITIALIZATION ------------------------------ //
    this.chart = dc[this.chartType](this.element)
        .width(this._getWidth())
        .height(this._getHeight());

    // ENABLE LEGEND IF SPECIFIED IN VISUALIZATION SETTINGS
    // I'm sure it made sense to somebody at some point to make this setting live in two different places depending on the type of chart.
    var legendEnabled = chartType === 'pieChart' ? this.settings.pie.legend_enabled : this.settings.chart.legend_enabled;
    if (legendEnabled) this.chart.legend(dc.legend());
}
