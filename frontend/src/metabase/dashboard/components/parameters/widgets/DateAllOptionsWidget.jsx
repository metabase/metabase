/* @flow */

import React, {Component, PropTypes} from "react";

import DatePicker, {OPERATORS} from "metabase/query_builder/components/filters/pickers/DatePicker.jsx";
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
    "Current": getFilterValueSerializer((_, unit) => `current${unit}`),
    "Before": getFilterValueSerializer((value) => `~${value}`),
    "After": getFilterValueSerializer((value) => `${value}~`),
    "On": getFilterValueSerializer((value) => `${value}`),
    "Between": getFilterValueSerializer((from, to) => `${from}~${to}`),
    "Is Empty": () => "is-empty",
    "Not Empty": () => "not-empty"
};

function getFilterOperator(filter) {
    return OPERATORS.find((op) => op.test(filter));
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
    {testRegex: /^current([a-z]+)$/, deserialize: (matches) => ["time-interval", noopRef, "current", matches[0]] },
    {testRegex: /^~(.+)$/, deserialize: (matches) => ["<", noopRef, matches[0]]},
    {testRegex: /^(.+)~$/, deserialize: (matches) => [">", noopRef, matches[0]]},
    {testRegex: /^(.+)~$/, deserialize: (matches) => [">", noopRef, matches[0]]},
    // TODO 3/27/17 Atte Keinänen
    // Unify BETWEEN -> between, IS_NULL -> is-null, NOT_NULL -> not-null throughout the codebase
    // $FlowFixMe
    {testRegex: /^([0-9-T:]+)$/, deserialize: (matches) => ["BETWEEN", noopRef, matches[0], matches[1]]},
    // $FlowFixMe
    {testRegex: /is-empty/, deserialize: (matches) => ["IS_NULL", noopRef]},
    // $FlowFixMe
    {testRegex: /not-empty/, deserialize: (matches) => ["NOT_NULL", noopRef]},
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

type DefaultProps = {};
type Props = { setValue: *, onClose: * };
type State = { filter: FieldFilter };

export default class DateAllOptionsWidget extends Component<DefaultProps, Props, State> {
    state: State;

    constructor(props: *, context: *) {
        super(props, context);

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

    componentWillUnmount() {
        this.props.setValue(filterToUrlEncoded(this.state.filter));
    }

    setFilter = (filter: FieldFilter) => {
        this.setState({filter});
    };

    render() {
        const {onClose} = this.props;

        return (<div>
            <DatePicker
                filter={this.state.filter}
                onFilterChange={this.setFilter}
            />
            <div className="FilterPopover-footer p1">
                <button
                    className="Button Button--purple full"
                    onClick={onClose}
                >
                    Update filter
                </button>
            </div>
        </div>)
    }
}
