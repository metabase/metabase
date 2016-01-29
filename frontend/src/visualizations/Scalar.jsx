import React, { Component, PropTypes } from "react";

export default class Scalar extends Component {
    static displayName = "Number";
    static identifier = "scalar";
    static iconName = "number";

    static isSensible(cols, rows) {
        return rows.length === 1 && cols.length === 1;
    }

    render() {
        return (
            <div>Scalar</div>
        );
    }
}
