import React, { Component, PropTypes } from "react";

import { isString } from "metabase/lib/schema_metadata";

export default class WorldMap extends Component {
    static displayName = "World Map";
    static identifier = "country";
    static iconName = "countrymap";

    static isSensible(cols, rows) {
        return cols.length > 1 && isString(cols[0]);
    }

    render() {
        return (
            <div>World Map</div>
        );
    }
}
