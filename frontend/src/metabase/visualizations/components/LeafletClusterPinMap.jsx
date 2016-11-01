import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import LeafletMap from "./LeafletMap.jsx";
import L from "leaflet/dist/leaflet-src.js";
import categoryClusterIcon from "metabase/visualizations/lib/categoryClusterIcon";

import { PruneCluster, PruneClusterForLeaflet } from "imports?L=leaflet/dist/leaflet-src.js!exports?PruneCluster&PruneClusterForLeaflet!prunecluster/dist/PruneCluster.js";
import "imports?L=leaflet/dist/leaflet-src.js!Leaflet.vector-markers";

import "leaflet/dist/leaflet.css";
import "Leaflet.vector-markers/dist/leaflet-vector-markers.css";
import "PruneCluster/dist/LeafletStyleSheet.css"

import _ from "underscore";

import * as colors from "metabase/lib/colors";

export default class LeafletMarkerPinMap extends LeafletMap {
    componentDidMount() {
        super.componentDidMount();

        this.pruneCluster = new PruneClusterForLeaflet();
        this._originalBuildLeafletClusterIcon = this.pruneCluster.BuildLeafletClusterIcon;

        this.map.addLayer(this.pruneCluster);

        this.componentDidUpdate({}, {});
    }

    componentDidUpdate(prevProps, prevState) {
        super.componentDidUpdate(prevProps, prevState);

        try {
            const { points } = this.props;
            const { pruneCluster } = this;

            pruneCluster.RemoveMarkers();

            let catColorMap;
            if (points[0].length > 2) {
                catColorMap = generateCategoryColorMap(_.union(_.pluck(points, 2)));
                pruneCluster.BuildLeafletClusterIcon = (cluster) => {
                    L.Icon.MarkerCluster = categoryClusterIcon(catColorMap);

                    let e = new L.Icon.MarkerCluster();
                    e.stats = cluster.stats;
                    e.population = cluster.population;
                    return e;
                };
            } else {
                pruneCluster.BuildLeafletClusterIcon = this._originalBuildLeafletClusterIcon;
            }

            for (const point of points) {
                const [longitude, latitude] = point;
                const marker = new PruneCluster.Marker(latitude, longitude);
                if (point.length > 2){
                    const category = catColorMap[point[2]];
                    marker.data.icon = this._createMarkerIcon(category.color);
                    marker.category = category.id;
                } else {
                    marker.data.icon = this._createMarkerIcon(colors.normal.blue);
                }
                pruneCluster.RegisterMarker(marker);
            }

            pruneCluster.ProcessView();

        } catch (err) {
            console.error(err);
            this.props.onRenderError(err.message || err);
        }
    }

    _createMarkerIcon(color) {
        return global.L.VectorMarkers.icon({ icon: "map-marker", markerColor: color });
    }
}

// this is obviously a stupid hash algorithm but good enough?
const hashString = (string) => {
    let hash = 0;
    for (let i = 0; i < string.length; i++) {
        hash += string.charCodeAt(i);
    }
    return hash;
}

const colorForString = (string) => {
    return colors.harmony[hashString(string) % colors.harmony.length];
}

const generateColorCode = (value) => {
    if (/^(?:yes|true|on|1)$/i.test(value)) {
        return colors.saturated.green;
    }
    if (/^(?:no|false|off|0|null)$/i.test(value)) {
        return colors.saturated.red;
    }
    return colorForString(value);
}

const generateCategoryColorMap = (categories) => {
    let map = {};
    for (let [index, category] of Object.entries(categories)) {
        map[category] = {
            color: generateColorCode(String(category)),
            id: index
        }
    }
    return map;
}
