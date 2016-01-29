import React, { Component, PropTypes } from "react";

import { isString } from "metabase/lib/schema_metadata";

export default class USStateMap extends Component {
    static displayName = "US State Map";
    static identifier = "state";
    static iconName = "statemap";

    static isSensible(cols, rows) {
        return cols.length > 1 && isString(cols[0]);
    }

    render() {
        return (
            <div>USStateMap</div>
        );
    }
}
