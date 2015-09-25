"use strict";

import React, { Component, PropTypes } from "react";

import SpecificDatePicker from "./SpecificDatePicker.react";
import RelativeDatePicker from "./RelativeDatePicker.react";

import cx from "classnames";

export default class DatePicker extends Component {
    constructor(props) {
        super(props);
        this.state = {
            pane: "relative"
        };
    }

    render() {
        return (
            <div>
                <div className="p1 border-bottom">
                    <button className={cx("Button Button--medium mr1", { "Button--purple": this.state.pane === "relative" })} onClick={() => this.setState({ pane: "relative" })}>Relative date</button>
                    <button className={cx("Button Button--medium", { "Button--purple": this.state.pane === "specific" })} onClick={() => this.setState({ pane: "specific" })}>Specific date</button>
                </div>
                { this.state.pane === "relative" ?
                    <RelativeDatePicker
                        filter={this.props.filter}
                        onFilterChange={this.props.onFilterChange}
                    />
                :
                    <SpecificDatePicker
                        filter={this.props.filter}
                        onFilterChange={this.props.onFilterChange}
                        onOperatorChange={this.props.onOperatorChange}
                    />
                }
            </div>
        )
    }
}

DatePicker.propTypes = {
    filter: PropTypes.array.isRequired,
    onFilterChange: PropTypes.func.isRequired,
    onOperatorChange: PropTypes.func.isRequired
};
