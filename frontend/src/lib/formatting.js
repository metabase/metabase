import d3 from "d3";
import inflection from "inflection";
import moment from "moment";
import React from "react";

const PRECISION_NUMBER_FORMATTER      = d3.format(".2r");
const FIXED_NUMBER_FORMATTER          = d3.format(",.f");
const FIXED_NUMBER_FORMATTER_NO_COMMA = d3.format(".f");
const DECIMAL_DEGREES_FORMATTER       = d3.format(".08f");

export function formatNumber(number, options) {
    options = { comma: true, ...options}
    if (number > -1 && number < 1) {
        // numbers between 1 and -1 round to 2 significant digits with extra 0s stripped off
        return PRECISION_NUMBER_FORMATTER(number).replace(/\.?0+$/, "");
    } else {
        // anything else rounds to at most 2 decimal points
        if (options.comma) {
            return FIXED_NUMBER_FORMATTER(d3.round(number, 2));
        } else {
            return FIXED_NUMBER_FORMATTER_NO_COMMA(d3.round(number, 2));
        }
    }
}

export function formatScalar(scalar) {
    if (typeof scalar === "number") {
        return formatNumber(scalar, { comma: true });
    } else {
        return String(scalar);
    }
}

function formatMajorMinor(major, minor, options = {}) {
    options = { jsx: false, majorWidth: 3, ...options };
    if (options.jsx) {
        return (
            <span>
                <span style={{ minWidth: options.majorWidth + "em" }} className="inline-block text-right text-bold">{major}</span>
                {" - "}
                <span>{minor}</span>
            </span>
        );
    } else {
        return `${major} - ${minor}`;
    }
}

export function formatTimeWithUnit(value, unit, options = {}) {
    let m = moment(value);
    switch (unit) {
        case "hour": // 12 AM - January 1, 2015
            return formatMajorMinor(m.format("h A"), m.format("MMMM D, YYYY"), options);
        case "day": // January 1, 2015
            return m.format("MMMM D, YYYY");
        case "week": // 1st - 2015
            // force 'en' locale for now since our weeks currently always start on Sundays
            m = m.locale("en");
            return formatMajorMinor(m.format("wo"), m.format("gggg"), options);
        case "month": // January 2015
            return options.jsx ?
                <div><span className="text-bold">{m.format("MMMM")}</span> {m.format("YYYY")}</div> :
                m.format("MMMM") + " " + m.format("YYYY");
        case "year": // 2015
            return String(value);
        case "quarter": // Q1 - 2015
            return formatMajorMinor(m.format("[Q]Q"), m.format("YYYY"), { ...options, majorWidth: 0 });
        case "hour-of-day": // 12 AM
            return moment().hour(value).format("h A");
        case "day-of-week": // Sunday
            return moment().day(value - 1).format("dddd");
        case "week-of-year": // 1st
            return moment().week(value).format("wo");
        case "month-of-year": // January
            return moment().month(value - 1).format("MMMM");
    }
    return String(value);
}

export function formatValue(value, column, options = {}) {
    options = { jsx: false, ...options };
    if (value == undefined) {
        return null
    } else if (column && column.unit != null) {
        return formatTimeWithUnit(value, column.unit, options);
    } else if (moment.isDate(value) || moment(value, moment.ISO_8601).isValid()) {
        return moment(value).format("LLLL");
    } else if (typeof value === "string") {
        return value;
    } else if (typeof value === "number") {
        if (column && (column.special_type === "latitude" || column.special_type === "longitude")) {
            return DECIMAL_DEGREES_FORMATTER(value)
        } else {
            // don't show comma unless it's a number special_type (and eventually currency, etc)
            let comma = column && column.special_type === "number";
            return formatNumber(value, { comma, ...options });
        }
    } else if (typeof value === "object") {
        // no extra whitespace for table cells
        return JSON.stringify(value);
    } else {
        return String(value);
    }
}

export function singularize(...args) {
    return inflection.singularize(...args);
}

export function pluralize(...args) {
    return inflection.pluralize(...args);
}

export function capitalize(...args) {
    return inflection.capitalize(...args);
}

export function inflect(...args) {
    return inflection.inflect(...args);
}

export function titleize(...args) {
    return inflection.titleize(...args);
}

export function humanize(...args) {
    return inflection.humanize(...args);
}

// Removes trailing "id" from field names
export function stripId(name) {
    return name && name.replace(/ id$/i, "");
}

export function assignUserColors(userIds, currentUserId, colorClasses = ['bg-brand', 'bg-purple', 'bg-error', 'bg-green', 'bg-gold', 'bg-grey-2']) {
    let assignments = {};

    const currentUserColor = colorClasses[0];
    const otherUserColors = colorClasses.slice(1);
    let otherUserColorIndex = 0;

    for (let userId of userIds) {
        if (!(userId in assignments)) {
            if (userId === currentUserId) {
                assignments[userId] = currentUserColor;
            } else if (userId != null) {
                assignments[userId] = otherUserColors[otherUserColorIndex++ % otherUserColors.length];
            }
        }
    }

    return assignments;
}
