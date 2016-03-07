import React, { Component, PropTypes } from "react";

import ChoroplethMap from "./components/ChoroplethMap.jsx";

export default class USStateMap extends ChoroplethMap {
    static displayName = "US State Map";
    static identifier = "state";
    static iconName = "statemap";
}
