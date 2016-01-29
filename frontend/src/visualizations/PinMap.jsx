import React, { Component, PropTypes } from "react";

import { hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";

export default class PinMap extends Component {
    static displayName = "Pin Map";
    static identifier = "pin_map";
    static iconName = "pinmap";

    static isSensible(cols, rows) {
        return hasLatitudeAndLongitudeColumns(cols);
    }

    render() {
        return (
            <div>Pin Map</div>
        );
    }
}
