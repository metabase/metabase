import React, { Component, PropTypes } from "react";

import RelativeDatePicker from "metabase/query_builder/filters/pickers/RelativeDatePicker.jsx";

import _ from "underscore";

// HACK: easiest way to get working with RelativeDatePicker
const FILTERS = {
    "today": {
        name: "Today",
        mapping: ["=", null, ["relative_datetime", "current"]]
    },
    "yesterday": {
        name: "Yesterday",
        mapping: ["=", null, ["relative_datetime", -1, "day"]]
    },
    "past7days": {
        name: "Past 7 Days",
        mapping: ["TIME_INTERVAL", null, -7, "day"]
    },
    "past30days": {
        name: "Past 30 Days",
        mapping: ["TIME_INTERVAL", null, -30, "day"]
    },
    "lastweek": {
        name: "Last Week",
        mapping: ["TIME_INTERVAL", null, "last", "week"]
    },
    "lastmonth": {
        name: "Last Month",
        mapping: ["TIME_INTERVAL", null, "last", "month"]
    },
    "lastyear": {
        name: "Last Year",
        mapping: ["TIME_INTERVAL", null, "last", "year"]
    },
    "thisweek": {
        name: "This Week",
        mapping: ["TIME_INTERVAL", null, "current", "week"]
    },
    "thismonth": {
        name: "This Month",
        mapping: ["TIME_INTERVAL", null, "current", "month"]
    },
    "thisyear": {
        name: "This Year",
        mapping: ["TIME_INTERVAL", null, "current", "year"]
    }
};

export default class DateRelativeWidget extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    static format = (value) => FILTERS[value] ? FILTERS[value].name : "";

    render() {
        const { value, setValue, onClose } = this.props;
        return (
            <div className="px1" style={{ maxWidth: 300 }}>
                <RelativeDatePicker
                    filter={FILTERS[value] ? FILTERS[value].mapping : [null, null]}
                    onFilterChange={(filter) => {
                        setValue(_.findKey(FILTERS, (f) => _.isEqual(f.mapping, filter)));
                        onClose();
                    }}
                />
            </div>
        );
    }
}
