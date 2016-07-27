import React, { Component, PropTypes } from "react";

import ChoroplethMap from "./components/ChoroplethMap.jsx";
import PinMap from "./PinMap.jsx";

import { ChartSettingsError } from "metabase/visualizations/lib/errors";

export default class Map extends Component {
    static displayName = "Map";
    static identifier = "map";
    static iconName = "pinmap";

    static aliases = ["state", "country", "pin_map"];

    static minSize = { width: 4, height: 4 };

    static isSensible(cols, rows) {
        return true;
    }

    static checkRenderable(cols, rows, settings) {
        if (settings["map.type"] === "pin") {
            if (!settings["map.longitude_column"] || !settings["map.latitude_column"]) {
                throw new ChartSettingsError("Please select longitude and latitude columns in the chart settings.", "Data");
            }
        } else if (settings["map.type"] === "region"){
            if (!settings["map.dimension"] || !settings["map.metric"]) {
                throw new ChartSettingsError("Please select region and metric columns in the chart settings.", "Data");
            }
        }
    }

    render() {
        const { settings } = this.props;
        const type = settings["map.type"];
        if (type === "pin") {
            return <PinMap {...this.props} />
        } else if (type === "region") {
            return <ChoroplethMap {...this.props} />
        }
    }
}
