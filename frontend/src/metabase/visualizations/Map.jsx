import React, { Component, PropTypes } from "react";

import ChoroplethMap from "./components/ChoroplethMap.jsx";
import PinMap from "./PinMap.jsx";

export default class Map extends Component {
    static displayName = "Map";
    static identifier = "map";
    static iconName = "pinmap";

    static aliases = ["state", "country", "pin_map"];

    static minSize = { width: 4, height: 4 };

    static isSensible(cols, rows) {
        return true;
    }

    static checkRenderable(cols, rows) {
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
