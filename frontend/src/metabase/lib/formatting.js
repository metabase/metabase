import d3 from "d3";
import inflection from "inflection";
import moment from "moment";
import Humanize from "humanize";
import React from "react";

import { isDate, isNumber, isCoordinate } from "metabase/lib/schema_metadata";
import { parseTimestamp } from "metabase/lib/time";

const PRECISION_NUMBER_FORMATTER      = d3.format(".2r");
const FIXED_NUMBER_FORMATTER          = d3.format(",.f");
const FIXED_NUMBER_FORMATTER_NO_COMMA = d3.format(".f");
const DECIMAL_DEGREES_FORMATTER       = d3.format(".08f");

export function formatNumber(number, options = {}) {
    options = { comma: true, ...options};
    if (options.compact) {
        return Humanize.compactInteger(number, 1);
    } else if (number > -1 && number < 1) {
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

function formatMajorMinor(major, minor, options = {}) {
    options = {
        jsx: false,
        majorWidth: 3,
        ...options
    };
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

function formatTimeWithUnit(value, unit, options = {}) {
    let m = parseTimestamp(value, unit);
    if (!m.isValid()) {
        return String(value);
    }
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
            return m.format("YYYY");
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
        case "quarter-of-year": // January
            return moment().quarter(value).format("[Q]Q");
        default:
            return m.format("LLLL");
    }
}

export function formatValue(value, options = {}) {
    let column = options.column;
    options = {
        jsx: false,
        comma: isNumber(column),
        ...options
    };
    if (value == undefined) {
        return null;
    } else if (column && column.unit != null) {
        return formatTimeWithUnit(value, column.unit, options);
    } else if (isDate(column) || moment.isDate(value) || moment.isMoment(value) || moment(value, ["YYYY-MM-DD'T'HH:mm:ss.SSSZ"], true).isValid()) {
        return parseTimestamp(value, column && column.unit).format("LLLL");
    } else if (typeof value === "string") {
        return value;
    } else if (typeof value === "number") {
        if (isCoordinate(column)) {
            return DECIMAL_DEGREES_FORMATTER(value);
        } else {
            return formatNumber(value, options);
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

export function duration(milliseconds) {
    if (milliseconds < 60000) {
        let seconds = Math.round(milliseconds / 1000);
        return seconds + " " + inflect("second", seconds);
    } else {
        let minutes = Math.round(milliseconds / 1000 / 60);
        return minutes + " " + inflect("minute", minutes);
    }
}

// Removes trailing "id" from field names
export function stripId(name) {
    return name && name.replace(/ id$/i, "");
}

export function slugify(name) {
    return name && name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
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

export function formatSQL(sql) {
    if (typeof sql === "string") {
        sql = sql.replace(/\sFROM/, "\nFROM");
        sql = sql.replace(/\sLEFT JOIN/, "\nLEFT JOIN");
        sql = sql.replace(/\sWHERE/, "\nWHERE");
        sql = sql.replace(/\sGROUP BY/, "\nGROUP BY");
        sql = sql.replace(/\sORDER BY/, "\nORDER BY");
        sql = sql.replace(/\sLIMIT/, "\nLIMIT");
        sql = sql.replace(/\sAND\s/, "\n   AND ");
        sql = sql.replace(/\sOR\s/, "\n    OR ");

        return sql;
    }
}
