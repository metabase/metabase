import React, { Component, PropTypes } from "react";

import SpecificDatePicker from "./SpecificDatePicker.jsx";
import RelativeDatePicker from "./RelativeDatePicker.jsx";
import OperatorSelector from "../OperatorSelector.jsx";

export default class DatePicker extends Component {
    constructor(props) {
        super(props);
        this.state = {
            pane: this._detectPane(props),
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
        const { pane } = this.state;

        const operators = [
            { clause: "TIME_INTERVAL", verboseName: "Previous" },
            { clause: "TIME_INTERVAL", verboseName: "Next" },
            { clause: "<", verbose: "Before" }, 
            { clause: ">", verbose: "After" }, 
            { clause: "IS_NULL", verboseName: "Is Empty" },
            { clause: "NOT_NULL", verboseName: "Not Empty" }
        ];

        return (
            <div>
                <OperatorSelector
                    operator={pane}
                    operators={operators}
                    onOperatorChange={(operator) => {
                        this.setState({ pane: operator });
                        if (operator === "IS_NULL" || operator === "NOT_NULL") {
                            this.props.onOperatorChange(operator);
                        }
                    }}
                />
                { pane === "relative" ?
                    <RelativeDatePicker { ...this.props }  />
                : pane === "specific" ?
                    <SpecificDatePicker { ...this.props } />
                : null }
            </div>
        )
    }
}
