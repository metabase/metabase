/* @flow */

import React, {Component, PropTypes} from "react";
import cx from "classnames";

import DatePicker, {DATE_OPERATORS} from "metabase/query_builder/components/filters/pickers/DatePicker.jsx";
import {generateTimeFilterValuesDescriptions} from "metabase/lib/query_time";

import type {OperatorName} from "metabase/query_builder/components/filters/pickers/DatePicker.jsx";
import type {FieldFilter, LocalFieldReference} from "metabase/meta/types/Query";

type UrlEncoded = string;
// $FlowFixMe
type RegexMatches = [string];
type Deserializer = (RegexMatches) => FieldFilter;

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

const deserializersWithTestRegex: [{ testRegex: RegExp, deserialize: Deserializer}] = [
    {testRegex: /^past([0-9]+)([a-z]+)s$/, deserialize: (matches) => {
        return ["time-interval", noopRef, -parseInt(matches[0]), matches[1]]
    }},
    {testRegex: /^next([0-9]+)([a-z]+)s$/, deserialize: (matches) => {
        return ["time-interval", noopRef, parseInt(matches[0]), matches[1]]
    }},
    {testRegex: /^this([a-z]+)$/, deserialize: (matches) => ["time-interval", noopRef, "current", matches[0]] },
    {testRegex: /^~([0-9-T:]+)$/, deserialize: (matches) => ["<", noopRef, matches[0]]},
    {testRegex: /^([0-9-T:]+)~$/, deserialize: (matches) => [">", noopRef, matches[0]]},
    {testRegex: /^([0-9-T:]+)$/, deserialize: (matches) => ["=", noopRef, matches[0]]},
    // TODO 3/27/17 Atte Keinänen
    // Unify BETWEEN -> between, IS_NULL -> is-null, NOT_NULL -> not-null throughout the codebase
    // $FlowFixMe
    {testRegex: /^([0-9-T:]+)~([0-9-T:]+)$/, deserialize: (matches) => ["BETWEEN", noopRef, matches[0], matches[1]]},
];

function urlEncodedToFilter(urlEncoded: UrlEncoded): ?FieldFilter {
    const deserializer =
        deserializersWithTestRegex.find((des) => urlEncoded.search(des.testRegex) !== -1);

    if (deserializer) {
        const substringMatches = deserializer.testRegex.exec(urlEncoded).splice(1);
        return deserializer.deserialize(substringMatches);
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
            filter: props.value != null ? urlEncodedToFilter(props.value) || [] : []
        }
    }

    static propTypes = {};
    static defaultProps = {};

    static format = (urlEncoded: ?string) => {
        if (urlEncoded == null) return null;
        const filter = urlEncodedToFilter(urlEncoded);

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
