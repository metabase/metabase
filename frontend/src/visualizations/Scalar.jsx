import React, { Component, PropTypes } from "react";

import { formatScalar } from "metabase/lib/formatting";

export default class Scalar extends Component {
    static displayName = "Number";
    static identifier = "scalar";
    static iconName = "number";

    static isSensible(cols, rows) {
        return rows.length === 1 && cols.length === 1;
    }

    static checkRenderable(cols, rows) {
        // scalar can always be rendered, nothing needed here
    }

    render() {
        let { data, isDashboard } = this.props;
        let formattedScalarValue = formatScalar(data && data.rows && data.rows[0] && data.rows[0][0] || "");

        if (isDashboard) {
            return (
                <div className={"Card--scalar " + this.props.className}>
                    <h1 className="Card-scalarValue text-normal">{formattedScalarValue}</h1>
                </div>
            );
        } else {
            return (
                <div className="Visualization--scalar flex full layout-centered">
                    <span>{formattedScalarValue}</span>
                </div>
            );
        }
    }
}
