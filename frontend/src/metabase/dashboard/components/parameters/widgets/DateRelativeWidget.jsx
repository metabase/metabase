import React, { Component, PropTypes } from "react";

import RelativeDatePicker from "metabase/query_builder/filters/pickers/RelativeDatePicker.jsx";

import _ from "underscore";

// HACK: easiest way to get working with RelativeDatePicker
const FILTER_MAPPINGS = {
    "today":      ["=", null, ["relative_datetime", "current"]],
    "yesterday":  ["=", null, ["relative_datetime", -1, "day"]],
    "past7days":  ["TIME_INTERVAL", null, -7, "day"],
    "past30days": ["TIME_INTERVAL", null, -30, "day"],
    "lastweek":   ["TIME_INTERVAL", null, "last", "week"],
    "lastmonth":  ["TIME_INTERVAL", null, "last", "month"],
    "lastyear":   ["TIME_INTERVAL", null, "last", "year"],
    "thisweek":   ["TIME_INTERVAL", null, "current", "week"],
    "thismonth":  ["TIME_INTERVAL", null, "current", "month"],
    "thisyear":   ["TIME_INTERVAL", null, "current", "year"],
};

const FILTER_NAMES = {
    "today":      "Today",
    "yesterday":  "Yesterday",
    "past7days":  "Past 7 Days",
    "past30days": "Past 30 Days",
    "lastweek":   "Last Week",
    "lastmonth":  "Last Month",
    "lastyear":   "Last Year",
    "thisweek":   "This Week",
    "thismonth":  "This Month",
    "thisyear":   "This Year",
};

export default class DateRelativeWidget extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    static format = (value) => FILTER_NAMES[value] || "";

    render() {
        const { value, setValue, onClose } = this.props;
        return (
            <div className="px1" style={{ maxWidth: 300 }}>
                <RelativeDatePicker
                    filter={FILTER_MAPPINGS[value] || [null, null]}
                    onFilterChange={(filter) => {
                        setValue(_.findKey(FILTER_MAPPINGS, (f) => _.isEqual(f, filter)));
                        onClose();
                    }}
                />
            </div>
        );
    }
}
