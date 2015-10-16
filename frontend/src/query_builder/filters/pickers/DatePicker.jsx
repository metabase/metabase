import React, { Component, PropTypes } from "react";

import SpecificDatePicker from "./SpecificDatePicker.jsx";
import RelativeDatePicker from "./RelativeDatePicker.jsx";
import OperatorSelector from "../OperatorSelector.jsx";

export default class DatePicker extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            pane: this._detectPane(props)
        };
    }

    static propTypes = {
        filter: PropTypes.array.isRequired,
        onFilterChange: PropTypes.func.isRequired,
        onOperatorChange: PropTypes.func.isRequired,
        tableMetadata: PropTypes.object.isRequired
    };

    _detectPane(props) {
        if (props.filter[0] === "IS_NULL" || props.filter[0] === "NOT_NULL") {
            return props.filter[0]
        } else if (props.filter[0] !== "TIME_INTERVAL" && typeof props.filter[2] === "string") {
            return "specific";
        } else {
            return "relative";
        }
    }

    selectPane(pane) {
        this.props.onFilterChange([null, this.props.filter[1]]);
        this.setState({ pane });
    }

    render() {
        // MongoDB does not currently support relative date filters
        if (this.props.tableMetadata.db.engine === "mongo") {
            return (
                <SpecificDatePicker
                    filter={this.props.filter}
                    onFilterChange={this.props.onFilterChange}
                    onOperatorChange={this.props.onOperatorChange}
                />
            );
        }

        var operators = [
            { name: "relative", verboseName: "Relative date" },
            { name: "specific", verboseName: "Specific date" },
            { name: "IS_NULL", verboseName: "Is Empty", advanced: true },
            { name: "NOT_NULL", verboseName: "Not Empty", advanced: true }
        ];

        return (
            <div>
                <OperatorSelector
                    operator={this.state.pane}
                    operators={operators}
                    onOperatorChange={(operator) => {
                        this.setState({ pane: operator });
                        if (operator === "IS_NULL" || operator === "NOT_NULL") {
                            this.props.onOperatorChange(operator);
                        }
                    }}
                />
                { this.state.pane === "relative" ?
                    <RelativeDatePicker
                        filter={this.props.filter}
                        onFilterChange={this.props.onFilterChange}
                    />
                : this.state.pane === "specific" ?
                    <SpecificDatePicker
                        filter={this.props.filter}
                        onFilterChange={this.props.onFilterChange}
                        onOperatorChange={this.props.onOperatorChange}
                    />
                : null }
            </div>
        )
    }
}
