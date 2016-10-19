import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";

import { isString } from "metabase/lib/schema_metadata";
import { MinColumnsError } from "metabase/visualizations/lib/errors";
import MetabaseSettings from "metabase/lib/settings";

import { formatNumber } from "metabase/lib/formatting";

import ChartWithLegend from "./ChartWithLegend.jsx";
import ChartTooltip from "./ChartTooltip.jsx";
import LegacyChoropleth from "./LegacyChoropleth.jsx";
import LeafletChoropleth from "./LeafletChoropleth.jsx";

import d3 from "d3";
import _ from "underscore";
import L from "leaflet/dist/leaflet-src.js";

// const HEAT_MAP_COLORS = [
//     "#E1F2FF",
//     "#67B9FF",
//     "#2DA0FF",
//     "#0A93FF",
//     "#005FB8"
// ];
// const HEAT_MAP_ZERO_COLOR = '#CCC';

const HEAT_MAP_COLORS = [
    // "#E2F2FF",
    "#C4E4FF",
    // "#9ED2FF",
    "#81C5FF",
    // "#6BBAFF",
    "#51AEFF",
    // "#36A2FF",
    "#1E96FF",
    // "#0089FF",
    "#0061B5"
];
const HEAT_MAP_ZERO_COLOR = '#CCC';

const geoJsonCache = new Map();
function loadGeoJson(geoJsonPath, callback) {
    if (geoJsonCache.has(geoJsonPath)) {
        setTimeout(() =>
            callback(geoJsonCache.get(geoJsonPath))
        , 0);
    } else {
        d3.json(geoJsonPath, (json) => {
            geoJsonCache.set(geoJsonPath, json)
            callback(json);
        });
    }
}

export default class ChoroplethMap extends Component {
    static propTypes = {
    };

    static minSize = { width: 4, height: 4 };

    static isSensible(cols, rows) {
        return cols.length > 1 && isString(cols[0]);
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
    }

    constructor(props, context) {
        super(props, context);
        this.state = {
            geoJson: null,
            geoJsonPath: null
        };
    }

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    _getDetails(props) {
        return MetabaseSettings.get("custom_geojson", {})[props.settings["map.region"]];
    }

    componentWillReceiveProps(nextProps) {
        const details = this._getDetails(nextProps)
        if (details) {
            let geoJsonPath;
            if (details.builtin) {
                geoJsonPath = details.url;
            } else {
                geoJsonPath = "/api/geojson/" + nextProps.settings["map.region"]
            }
            if (this.state.geoJsonPath !== geoJsonPath) {
                this.setState({
                    geoJson: null,
                    geoJsonPath: geoJsonPath
                });
                loadGeoJson(geoJsonPath, (geoJson) => {
                    this.setState({
                        geoJson: geoJson,
                        geoJsonPath: geoJsonPath,
                        minimalBounds: computeMinimalBounds(geoJson.features)
                    });
                });
            }
        }
    }

    render() {
        const details = this._getDetails(this.props);
        if (!details) {
            return (
                <div>unknown map</div>
            );
        }

        const { series, className, gridSize, hovered, onHoverChange, settings } = this.props;
        let { geoJson, minimalBounds } = this.state;

        // special case builtin maps to use legacy choropleth map
        let projection;
        if (settings["map.region"] === "us_states") {
            projection = d3.geo.albersUsa();
        } else if (settings["map.region"] === "world_countries") {
            projection = d3.geo.mercator();
        } else {
            projection = null;
        }

        const nameProperty = details.region_name;
        const keyProperty = details.region_key;

        if (!geoJson) {
            return (
                <div className={className + " flex layout-centered"}>
                    <LoadingSpinner />
                </div>
            );
        }

        const [{ data: { cols, rows }}] = series;
        const dimensionIndex = _.findIndex(cols, (col) => col.name === settings["map.dimension"]);
        const metricIndex = _.findIndex(cols, (col) => col.name === settings["map.metric"]);

        const getRowKey       = (row) => String(row[dimensionIndex]).toLowerCase();
        const getRowValue     = (row) => row[metricIndex] || 0;
        const getFeatureName  = (feature) => String(feature.properties[nameProperty]);
        const getFeatureKey   = (feature) => String(feature.properties[keyProperty]).toLowerCase();
        const getFeatureValue = (feature) => valuesMap[getFeatureKey(feature)];

        const onHoverFeature = (hover) => {
            onHoverChange && onHoverChange(hover && {
                index: HEAT_MAP_COLORS.indexOf(getColor(hover.feature)),
                event: hover.event,
                data: { key: getFeatureName(hover.feature), value: getFeatureValue(hover.feature)
            } })
        }

        const valuesMap = {};
        for (const row of rows) {
            valuesMap[getRowKey(row)] = (valuesMap[getRowKey(row)] || 0) + getRowValue(row);
        }

        var colorScale = d3.scale.quantize().domain(d3.extent(rows, d => d[1])).range(HEAT_MAP_COLORS);

        let legendColors = HEAT_MAP_COLORS.slice();
        let legendTitles = HEAT_MAP_COLORS.map((color, index) => {
            let [min, max] = colorScale.invertExtent(color);
            return index === HEAT_MAP_COLORS.length - 1 ?
                formatNumber(min) + " +" :
                formatNumber(min) + " - " + formatNumber(max)
        });

        const getColor = (feature) => {
            let value = getFeatureValue(feature);
            return value == null ? HEAT_MAP_ZERO_COLOR : colorScale(value);
        }

        let aspectRatio;
        if (projection) {
            let translate = projection.translate();
            let width = translate[0] * 2;
            let height = translate[1] * 2;
            aspectRatio = width / height;
        } else {
            aspectRatio =
                (minimalBounds.getEast() - minimalBounds.getWest()) /
                (minimalBounds.getNorth() - minimalBounds.getSouth());
        }

        return (
            <ChartWithLegend
                className={className}
                aspectRatio={aspectRatio}
                legendTitles={legendTitles} legendColors={legendColors}
                gridSize={gridSize}
                hovered={hovered} onHoverChange={onHoverChange}
            >
                { projection ?
                    <LegacyChoropleth
                        series={series}
                        geoJson={geoJson}
                        getColor={getColor}
                        onHoverFeature={onHoverFeature}
                        projection={projection}
                    />
                :
                    <LeafletChoropleth
                        series={series}
                        geoJson={geoJson}
                        getColor={getColor}
                        onHoverFeature={onHoverFeature}
                        minimalBounds={minimalBounds}
                    />
                }
                <ChartTooltip series={series} hovered={hovered} />
            </ChartWithLegend>
        );
    }
}

function computeMinimalBounds(features) {
    const points = getAllFeaturesPoints(features);
    const gap = computeLargestGap(points, (d) => d[0]);
    const [west, east] = d3.extent(points, (d) => d[0]);
    const [north, south] = d3.extent(points, (d) => d[1]);

    const normalGapSize = gap[1] - gap[0];
    const antemeridianGapSize = (180 + west) + (180 - east);

    if (antemeridianGapSize > normalGapSize) {
        return L.latLngBounds(
            L.latLng(south, west), // SW
            L.latLng(north, east)  // NE
        )
    } else {
        return L.latLngBounds(
            L.latLng(south, -360 + gap[1]), // SW
            L.latLng(north, gap[0])  // NE
        )
    }
}

function computeLargestGap(items, valueAccessor = (d) => d) {
    const [xMin, xMax] = d3.extent(items, valueAccessor);
    if (xMin === xMax) {
        return [xMin, xMax];
    }

    const buckets = [];
    const bucketSize = (xMax - xMin) / items.length;
    for (const item of items) {
        const x = valueAccessor(item);
        const k = Math.floor((x - xMin) / bucketSize);
        if (buckets[k] === undefined) {
            buckets[k] = [x, x];
        } else {
            buckets[k] = [Math.min(x, buckets[k][0]), Math.max(x, buckets[k][1])];
        }
    }
    let largestGap = [0, 0];
    for (let i = 0; i < items.length; i++) {
        if (buckets[i + 1] === undefined) {
            buckets[i + 1] = buckets[i];
        } else if (buckets[i + 1][0] - buckets[i][1] > largestGap[1] - largestGap[0]) {
            largestGap = [buckets[i][1], buckets[i + 1][0]];
        }
    }
    return largestGap;
}

function getAllFeaturesPoints(features) {
    let points = [];
    for (let feature of features) {
        if (feature.geometry.type === "Polygon") {
            for (let coordinates of feature.geometry.coordinates) {
                points = points.concat(coordinates);
            }
        } else if (feature.geometry.type === "MultiPolygon") {
            for (let coordinatesList of feature.geometry.coordinates) {
                for (let coordinates of coordinatesList) {
                    points = points.concat(coordinates);
                }
            }
        } else {
            console.warn("Unimplemented feature.geometry.type", feature.geometry.type)
        }
    }
    return points;
}
