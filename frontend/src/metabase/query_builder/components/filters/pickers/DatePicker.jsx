import React, { Component, PropTypes } from "react";

import SpecificDatePicker from "./SpecificDatePicker";
import RelativeDatePicker from "./RelativeDatePicker";
import OperatorSelector from "../OperatorSelector";
import moment from "moment";

import _ from "underscore";

const OPERATORS = [
    { clause: "TIME_INTERVAL", name: "Previous" },
    { clause: "TIME_INTERVAL", name: "Next" },
    { clause: "TIME_INTERVAL", name: "Current" },
    { clause: "<", name: "Before" },
    { clause: ">", name: "After" },
    { clause: "=", name: "On" },
    { clause: "=", name: "Between" },
    { clause: "IS_NULL", name: "Is Empty" },
    { clause: "NOT_NULL", name: "Not Empty" }
];

export default class DatePicker extends Component {
    constructor(props) {
        super(props);
        this.state = {
            operator: this.detectPane(props.filter) || "previous"
        };

        this.changeOperator = this.changeOperator.bind(this)
    }

    static propTypes = {
        filter: PropTypes.array.isRequired,
        onFilterChange: PropTypes.func.isRequired,
        onOperatorChange: PropTypes.func.isRequired,
        tableMetadata: PropTypes.object.isRequired
    };

    detectPane(filter) {
        const [ clause, field, value, endValue ] = filter;

        if(clause !== "TIME_INTERVAL") {
            // TODO - will need to handle between
            return OPERATORS[_.findIndex(OPERATORS, { clause })].name.toLowerCase()
        } else {
            if(value < 0) {
                return "previous";
            } else if (value > 0) {
                return "next";
            } else {
                return "current";
            }
        }
    }

    changeOperator (operator) {
        this.setState({ operator: operator.name.toLowerCase() })
        this.props.onOperatorChange(operator.clause)
    }

    render() {
        const { operator } = this.state;
        const [, , value , endVal] = this.props.filter;

        return (
            <div>
                <OperatorSelector
                    operator={operator}
                    operators={OPERATORS}
                    onOperatorChange={operator => this.changeOperator(operator)}
                />
                { operator === "previous" || operator ==="next" ?
                    <RelativeDatePicker
                        formatter={(val) => {
                            if(operator === "previous") {
                                return val * -1
                            }
                            return val
                        }}
                        { ...this.props}
                    />
                : operator === "after" || operator === "before" || operator === "on" ?
                    <SpecificDatePicker
                        value={value}
                        { ...this.props }
                    />
                : operator === "between" ?
                    <MultiDatePicker
                        start={value || moment()}
                        end={endVal || moment()}
                        { ...this.props }
                    />
                : null }
            </div>
        )
    }
}

const MultiDatePicker = ({ start, end, ...rest }) =>
    <div className="flex align-center">
        <SpecificDatePicker
            date={start}
            {...rest}
        />
        <SpecificDatePicker
            date={end}
            {...rest}
        />
    </div>
