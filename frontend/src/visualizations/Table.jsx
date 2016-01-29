import React, { Component, PropTypes } from "react";

export default class Bar extends Component {
    static displayName = "Table";
    static identifier = "table";
    static iconName = "table";

    static isSensible(cols, rows) {
        return true;
    }

    render() {
        return (
            <div>Table</div>
        );
    }
}
