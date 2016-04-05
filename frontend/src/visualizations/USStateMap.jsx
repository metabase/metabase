import React, { Component, PropTypes } from "react";

import ChoroplethMap from "./components/ChoroplethMap.jsx";

import d3 from "d3";

export default class USStateMap extends ChoroplethMap {
    static displayName = "US State Map";
    static identifier = "state";
    static iconName = "statemap";

    static defaultProps = {
        geoJsonPath: "/app/charts/us-states.json",
        projection: d3.geo.albersUsa(),
        getRowKey: (row) => row[0].toLowerCase(),
        getRowValue: (row) => row[1] || 0,
        getFeatureKey: (feature) => feature.properties.name.toLowerCase(),
        getFeatureName: (feature) => feature.properties.name
    };
}
