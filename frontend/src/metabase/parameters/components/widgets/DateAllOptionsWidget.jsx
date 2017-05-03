/* @flow */

import React, {Component} from "react";
import cx from "classnames";

import DatePicker, {DATE_OPERATORS} from "metabase/query_builder/components/filters/pickers/DatePicker.jsx";
import {generateTimeFilterValuesDescriptions} from "metabase/lib/query_time";
import { dateParameterValueToMBQL } from "metabase/meta/Parameter";

import type {OperatorName} from "metabase/query_builder/components/filters/pickers/DatePicker.jsx";
import type {FieldFilter} from "metabase/meta/types/Query";

type UrlEncoded = string;

// Use a placeholder value as field references are not used in dashboard filters
// $FlowFixMe
const noopRef: LocalFieldReference = null;

function getFilterValueSerializer(func: ((val1: string, val2: string) => UrlEncoded)) {
    // $FlowFixMe
    return filter => func(filter[2], filter[3])
}

const serializersByOperatorName: { [id: OperatorName]: (FieldFilter) => UrlEncoded } = {
    // $FlowFixMe
    "Previous": getFilterValueSerializer((value, unit) => `past${-value}${unit}s`),
    "Next": getFilterValueSerializer((value, unit) => `next${value}${unit}s`),
    "Current": getFilterValueSerializer((_, unit) => `this${unit}`),
    "Before": getFilterValueSerializer((value) => `~${value}`),
    "After": getFilterValueSerializer((value) => `${value}~`),
    "On": getFilterValueSerializer((value) => `${value}`),
    "Between": getFilterValueSerializer((from, to) => `${from}~${to}`)
};

function getFilterOperator(filter) {
    return DATE_OPERATORS.find((op) => op.test(filter));
}
function filterToUrlEncoded(filter: FieldFilter): ?UrlEncoded {
    const operator = getFilterOperator(filter)

    if (operator) {
        return serializersByOperatorName[operator.name](filter);
    } else {
        return null;
    }
}


const prefixedOperators: [OperatorName] = ["Before", "After", "On", "Is Empty", "Not Empty"];
function getFilterTitle(filter) {
    const desc = generateTimeFilterValuesDescriptions(filter).join(" - ")
    const op = getFilterOperator(filter);
    const prefix = op && prefixedOperators.indexOf(op.name) !== -1 ? `${op.name} ` : "";
    return prefix + desc;
}

type Props = {
    setValue: (value: ?string) => void,
    onClose: () => void
};

type State = { filter: FieldFilter };

export default class DateAllOptionsWidget extends Component<*, Props, State> {
    state: State;

    constructor(props: Props) {
        super(props);

        this.state = {
            // $FlowFixMe
            filter: props.value != null ? dateParameterValueToMBQL(props.value, noopRef) || [] : []
        }
    }

    static propTypes = {};
    static defaultProps = {};

    static format = (urlEncoded: ?string) => {
        if (urlEncoded == null) return null;
        const filter = dateParameterValueToMBQL(urlEncoded, noopRef);

        return filter ? getFilterTitle(filter) : null;
    };

    commitAndClose = () => {
        this.props.setValue(filterToUrlEncoded(this.state.filter));
        this.props.onClose()
    }

    setFilter = (filter: FieldFilter) => {
        this.setState({filter});
    }

    isValid() {
        const filterValues = this.state.filter.slice(2);
        return filterValues.every((value) => value != null);
    }

    render() {
        return (<div style={{minWidth: "300px"}}>
            <DatePicker
                filter={this.state.filter}
                onFilterChange={this.setFilter}
                hideEmptinessOperators
                hideTimeSelectors
            />
            <div className="FilterPopover-footer p1">
                <button
                    className={cx("Button Button--purple full", {"disabled": !this.isValid()})}
                    onClick={this.commitAndClose}
                >
                    Update filter
                </button>
            </div>
        </div>)
    }
}
