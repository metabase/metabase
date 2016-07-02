import ChartRenderer from "./ChartRenderer";

import d3 from "d3";

export default function GeoHeatmapChartRenderer(element, card, result) {
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
    ChartRenderer.call(this, element, card, result, 'geoChoroplethChart');

    // ------------------------------ METHODS ------------------------------ //
    this.superSetData = this.setData;
    this.setData = function(data, dimension, groupFn) {
        this.superSetData(data, dimension, groupFn);
        this.chart.colorDomain(d3.extent(this.data, (d) => d.value));
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
