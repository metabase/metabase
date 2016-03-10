import React, { Component, PropTypes } from "react";

import ChoroplethMap from "./components/ChoroplethMap.jsx";

import d3 from "d3";

export default class WorldMap extends ChoroplethMap {
    static displayName = "World Map";
    static identifier = "country";
    static iconName = "countrymap";

    static defaultProps = {
        geoJsonPath: "/app/charts/world.json",
        projection: d3.geo.mercator(),
        getRowKey: (row) => row[0].toLowerCase(),
        getRowValue: (row) => row[1] || 0,
        getFeatureKey: (feature) => feature.properties.ISO_A2.toLowerCase(),
        getFeatureName: (feature) => feature.properties.NAME
    };
}
