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
        let { data, isDashboard, className } = this.props;
        let formattedScalarValue = (data && data.rows && data.rows[0] && data.rows[0].length > 0) ? formatScalar(data.rows[0][0]) : "";

        if (isDashboard) {
            return (
                <div className={"Card--scalar " + className}>
                    <h1 className="Card-scalarValue text-normal">{formattedScalarValue}</h1>
                </div>
            );
        } else {
            return (
                <div className={"Visualization--scalar flex layout-centered " + className}>
                    <span>{formattedScalarValue}</span>
                </div>
            );
        }
    }
}
