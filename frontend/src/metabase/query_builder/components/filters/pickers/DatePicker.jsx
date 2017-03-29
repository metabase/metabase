/* @flow */

import React, { Component, PropTypes } from "react";

import SpecificDatePicker from "./SpecificDatePicker";
import RelativeDatePicker, { UnitPicker } from "./RelativeDatePicker";
import DateOperatorSelector from "../DateOperatorSelector";
import Calendar from "metabase/components/Calendar";

import moment from "moment";

import Query from "metabase/lib/query";
import { mbqlEq } from "metabase/lib/query/util";

import _ from "underscore";

import type {
    FieldFilter, TimeIntervalFilter,
    DatetimeUnit,
    ConcreteField,
    LocalFieldReference, ForeignFieldReference, ExpressionReference
} from "metabase/meta/types/Query";

const SingleDatePicker = ({ filter: [op, field, value], onFilterChange }) =>
    <SpecificDatePicker value={value} onChange={(value) => onFilterChange([op, field, value])} calendar />

const MultiDatePicker = ({ filter: [op, field, startValue, endValue], onFilterChange }) =>
    <div className="mx2 mb1">
        <div className="flex">
            <SpecificDatePicker value={startValue} onChange={(value) => onFilterChange([op, field, value, endValue])}  />
            <span className="mx2 mt2">&ndash;</span>
            <SpecificDatePicker value={endValue} onChange={(value) => onFilterChange([op, field, startValue, value])} />
        </div>
        <div className="Calendar--noContext">
            <Calendar
                initial={startValue ? moment(startValue) : moment()}
                selected={startValue && moment(startValue)}
                selectedEnd={endValue && moment(endValue)}
                onChange={(startValue, endValue) => onFilterChange([op, field, startValue, endValue])}
                isDual
            />
        </div>
    </div>

const PreviousPicker =  (props) =>
    <RelativeDatePicker {...props} formatter={(value) => value * -1} />

const NextPicker = (props) =>
    <RelativeDatePicker {...props} />


type CurentPickerProps = {
    filter: TimeIntervalFilter,
    onFilterChange: (filter: TimeIntervalFilter) => void
};

type CurrentPickerState = {
    showUnits: boolean
};

class CurrentPicker extends Component<*, CurentPickerProps, CurrentPickerState> {
    props: CurentPickerProps;
    state: CurrentPickerState;

    constructor(props) {
        super(props);
        this.state = { showUnits: false };
    }

    render() {
        const { filter: [operator, field, intervals, unit], onFilterChange } = this.props
        return (
            <div className="mx2">
                <UnitPicker
                    value={unit}
                    open={this.state.showUnits}
                    onChange={(value) => {
                        onFilterChange([operator, field, intervals, value]);
                        this.setState({ showUnits: false });
                    }}
                    togglePicker={() => this.setState({ showUnits: !this.state.showUnits })}
                    formatter={(val) => val }
                />
            </div>
        )
    }
}


const getIntervals = ([op, field, value, unit]) => mbqlEq(op, "time-interval") && typeof value === "number" ? Math.abs(value) : 30;
const getUnit      = ([op, field, value, unit]) => mbqlEq(op, "time-interval") && unit ? unit : "day";

const getDate = (value) => {
    if (typeof value !== "string" || !moment(value).isValid()) {
        value = moment().format("YYYY-MM-DD");
    }
    return value;
}

const hasTime = (value) => typeof value === "string" && /T\d{2}:\d{2}:\d{2}$/.test(value);

function getDateTimeField(field: ConcreteField, bucketing: ?DatetimeUnit): ConcreteField {
    let target = getDateTimeFieldTarget(field);
    if (bucketing) {
        // $FlowFixMe
        return ["datetime-field", target, bucketing];
    } else {
        return target;
    }
}

function getDateTimeFieldTarget(field: ConcreteField): LocalFieldReference|ForeignFieldReference|ExpressionReference {
    if (Query.isDatetimeField(field)) {
        // $FlowFixMe:
        return (field[1]: LocalFieldReference|ForeignFieldReference|ExpressionReference);
    } else {
        // $FlowFixMe
        return field;
    }
}

// wraps values in "datetime-field" is any of them have a time component
function getDateTimeFieldAndValues(filter: FieldFilter, count: number): [ConcreteField, any] {
    const values = filter.slice(2, 2 + count).map(value => value && getDate(value));
    const bucketing = _.any(values, hasTime) ? "minute" : null;
    const field = getDateTimeField(filter[1], bucketing);
    // $FlowFixMe
    return [field, ...values];
}

export type Operator = {
    name: string,
    widget?: any,
    init: (filter: FieldFilter) => any,
    test: (filter: FieldFilter) => boolean
}

const OPERATORS: Operator[] = [
    {
        name: "Previous",
        init: (filter) => ["time-interval", getDateTimeField(filter[1]), -getIntervals(filter), getUnit(filter)],
        // $FlowFixMe
        test: ([op, field, value]) => mbqlEq(op, "time-interval") && value < 0 || Object.is(value, -0),
        widget: PreviousPicker,
    },
    {
        name: "Next",
        init: (filter) => ["time-interval", getDateTimeField(filter[1]), getIntervals(filter), getUnit(filter)],
        // $FlowFixMe
        test: ([op, field, value]) => mbqlEq(op, "time-interval") && value >= 0,
        widget: NextPicker,
    },
    {
        name: "Current",
        init: (filter) => ["time-interval", getDateTimeField(filter[1]), "current", getUnit(filter)],
        test: ([op, field, value]) => mbqlEq(op, "time-interval") && value === "current",
        widget: CurrentPicker,
    },
    {
        name: "Before",
        init: (filter) =>  ["<", ...getDateTimeFieldAndValues(filter, 1)],
        test: ([op]) => op === "<",
        widget: SingleDatePicker,
    },
    {
        name: "After",
        init: (filter) => [">", ...getDateTimeFieldAndValues(filter, 1)],
        test: ([op]) => op === ">",
        widget: SingleDatePicker,
    },
    {
        name: "On",
        init: (filter) => ["=", ...getDateTimeFieldAndValues(filter, 1)],
        test: ([op]) => op === "=",
        widget: SingleDatePicker,
    },
    {
        name: "Between",
        init: (filter) => ["BETWEEN", ...getDateTimeFieldAndValues(filter, 2)],
        test: ([op]) => op === "BETWEEN",
        widget: MultiDatePicker,
    },
    {
        name: "Is Empty",
        init: (filter) => ["IS_NULL", getDateTimeField(filter[1])],
        test: ([op]) => op === "IS_NULL"
    },
    {
        name: "Not Empty",
        init: (filter) => ["NOT_NULL", getDateTimeField(filter[1])],
        test: ([op]) => op === "NOT_NULL"
    }
];

type Props = {
    filter: FieldFilter,
    onFilterChange: (filter: FieldFilter) => void,
    tableMetadata: any
}

export default class DatePicker extends Component<*, Props, *> {
    static propTypes = {
        filter: PropTypes.array.isRequired,
        onFilterChange: PropTypes.func.isRequired,
        tableMetadata: PropTypes.object.isRequired
    };

    componentWillMount() {
        const operator = this._getOperator() || OPERATORS[0];
        this.props.onFilterChange(operator.init(this.props.filter));
    }

    _getOperator() {
        return _.find(OPERATORS, (o) => o.test(this.props.filter));
    }

    render() {
        let { className, filter, onFilterChange } = this.props;
        const operator = this._getOperator();
        const Widget = operator && operator.widget;

        return (
            <div className={className}>
                <DateOperatorSelector
                    operator={operator && operator.name}
                    operators={OPERATORS}
                    onOperatorChange={operator => onFilterChange(operator.init(filter))}
                />
                { Widget &&
                    <Widget
                        {...this.props}
                        filter={filter}
                        onFilterChange={filter => {
                            if (operator && operator.init) {
                                onFilterChange(operator.init(filter));
                            } else {
                                onFilterChange(filter);
                            }
                        }}
                    />
                }
            </div>
        )
    }
}
