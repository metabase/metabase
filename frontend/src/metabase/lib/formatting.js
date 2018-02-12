/* @flow */

import d3 from "d3";
import inflection from "inflection";
import moment from "moment";
import Humanize from "humanize-plus";
import React from "react";

import ExternalLink from "metabase/components/ExternalLink.jsx";

import { isDate, isNumber, isCoordinate, isLatitude, isLongitude } from "metabase/lib/schema_metadata";
import { isa, TYPE } from "metabase/lib/types";
import { parseTimestamp,parseTime } from "metabase/lib/time";
import { rangeForValue } from "metabase/lib/dataset";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { decimalCount } from "metabase/visualizations/lib/numeric";

import type { Column, Value } from "metabase/meta/types/Dataset";
import type { Field } from "metabase/meta/types/Field";
import type { DatetimeUnit } from "metabase/meta/types/Query";
import type { Moment } from "metabase/meta/types";

export type FormattingOptions = {
    column?: Column,
    majorWidth?: number,
    type?: "axis"|"cell"|"tooltip",
    comma?: boolean,
    jsx?: boolean,
    compact?: boolean,
}

const PRECISION_NUMBER_FORMATTER      = d3.format(".2r");
const FIXED_NUMBER_FORMATTER          = d3.format(",.f");
const FIXED_NUMBER_FORMATTER_NO_COMMA = d3.format(".f");
const DECIMAL_DEGREES_FORMATTER       = d3.format(".08f");
const BINNING_DEGREES_FORMATTER       = (value, binWidth) => {
    return d3.format(`.0${decimalCount(binWidth)}f`)(value)
}

// use en dashes, for Maz
const RANGE_SEPARATOR = ` – `;

export function formatNumber(number: number, options: FormattingOptions = {}) {
    options = { comma: true, ...options};
    if (options.compact) {
        if (number === 0) {
            // 0 => 0
            return "0"
        } else if (number >= -0.01 && number <= 0.01) {
            // 0.01 => ~0
            return "~ 0";
        } else if (number > -1 && number < 1) {
            // 0.1 => 0.1
            return PRECISION_NUMBER_FORMATTER(number).replace(/\.?0+$/, "");
        } else {
            // 1 => 1
            // 1000 => 1K
            return Humanize.compactInteger(number, 1);
        }
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

export function formatCoordinate(value: number, options: FormattingOptions = {}) {
    const binWidth = options.column && options.column.binning_info && options.column.binning_info.bin_width;
    let direction = "";
    if (isLatitude(options.column)) {
        direction = " " + (value < 0 ? "S" : "N");
        value = Math.abs(value);
    } else if (isLongitude(options.column)) {
        direction = " " + (value < 0 ? "W" : "E");
        value = Math.abs(value);
    }

    const formattedValue = binWidth ? BINNING_DEGREES_FORMATTER(value, binWidth) : DECIMAL_DEGREES_FORMATTER(value)
    return formattedValue + "°" + direction;
}

export function formatRange(range: [number, number], formatter: (value: number) => string, options: FormattingOptions = {}) {
    return range.map(value => formatter(value, options)).join(` ${RANGE_SEPARATOR} `);
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

/** This formats a time with unit as a date range */
export function formatTimeRangeWithUnit(value: Value, unit: DatetimeUnit, options: FormattingOptions = {}) {
    let m = parseTimestamp(value, unit);
    if (!m.isValid()) {
        return String(value);
    }

    // Tooltips should show full month name, but condense "MMMM D, YYYY - MMMM D, YYYY" to "MMMM D - D, YYYY" etc
    const monthFormat = options.type === "tooltip" ? "MMMM" : "MMM";
    const condensed = options.type === "tooltip";

    const start = m.clone().startOf(unit);
    const end = m.clone().endOf(unit);
    if (start.isValid() && end.isValid()) {
        if (!condensed || start.year() !== end.year()) {
            return start.format(`${monthFormat} D, YYYY`) + RANGE_SEPARATOR + end.format(`${monthFormat} D, YYYY`);
        } else if (start.month() !== end.month()) {
            return start.format(`${monthFormat} D`) + RANGE_SEPARATOR + end.format(`${monthFormat} D, YYYY`);
        } else {
            return start.format(`${monthFormat} D`) + RANGE_SEPARATOR + end.format(`D, YYYY`);
        }
    } else {
        return formatWeek(m, options);
    }
}

function formatWeek(m: Moment, options: FormattingOptions = {}) {
    // force 'en' locale for now since our weeks currently always start on Sundays
    m = m.locale("en");
    return formatMajorMinor(m.format("wo"), m.format("gggg"), options);
}

export function formatTimeWithUnit(value: Value, unit: DatetimeUnit, options: FormattingOptions = {}) {
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
            if (options.type === "tooltip") {
                // tooltip show range like "January 1 - 7, 2017"
                return formatTimeRangeWithUnit(value, unit, options);
            } else if (options.type === "cell") {
                // table cells show range like "Jan 1, 2017 - Jan 7, 2017"
                return formatTimeRangeWithUnit(value, unit, options);
            } else if (options.type === "axis") {
                // axis ticks show start of the week as "Jan 1"
                return m.clone().startOf(unit).format(`MMM D`);
            } else {
                return formatWeek(m, options);
            }
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
            // $FlowFixMe:
            return moment().day(value - 1).format("dddd");
        case "day-of-month":
            return moment().date(value).format("D");
        case "week-of-year": // 1st
            return moment().week(value).format("wo");
        case "month-of-year": // January
            // $FlowFixMe:
            return moment().month(value - 1).format("MMMM");
        case "quarter-of-year": // January
            return moment().quarter(value).format("[Q]Q");
        default:
            return m.format("LLLL");
    }
}

export function formatTimeValue(value: Value) {
    let m = parseTime(value);
    if (!m.isValid()){
        return String(value);
    } else {
        return m.format("LT");
    }
}

// https://github.com/angular/angular.js/blob/v1.6.3/src/ng/directive/input.js#L27
const EMAIL_WHITELIST_REGEX = /^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(\.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

export function formatEmail(value: Value, { jsx }: FormattingOptions = {}) {
    const email = String(value);
    if (jsx && EMAIL_WHITELIST_REGEX.test(email)) {
        return <ExternalLink href={"mailto:" + email}>{email}</ExternalLink>;
    } else {
        return email;
    }
}

// based on https://github.com/angular/angular.js/blob/v1.6.3/src/ng/directive/input.js#L25
const URL_WHITELIST_REGEX = /^(https?|mailto):\/*(?:[^:@]+(?::[^@]+)?@)?(?:[^\s:/?#]+|\[[a-f\d:]+])(?::\d+)?(?:\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i;

export function formatUrl(value: Value, { jsx }: FormattingOptions = {}) {
    const url = String(value);
    if (jsx && URL_WHITELIST_REGEX.test(url)) {
        return <ExternalLink className="link link--wrappable" href={url}>{url}</ExternalLink>;
    } else {
        return url;
    }
}

// fallback for formatting a string without a column special_type
function formatStringFallback(value: Value, options: FormattingOptions = {}) {
    value = formatUrl(value, options);
    if (typeof value === 'string') {
        value = formatEmail(value, options);
    }
    return value;
}

export function formatValue(value: Value, options: FormattingOptions = {}) {
    let column = options.column;

    options = {
        jsx: false,
        comma: isNumber(column),
        ...options
    };

    // "column" may also be a field object
    // $FlowFixMe: remapping is a special field added by Visualization.jsx or getMetadata selector
    if (column && column.remapping && column.remapping.size > 0) {
        // $FlowFixMe
        const remappedValueSample = column.remapping.values().next().value

        // Even if the column only has a list of analyzed values without remappings, those values
        // are keys in `remapping` array with value `undefined`
        const hasSetRemappings = remappedValueSample !== undefined
        if (hasSetRemappings) {
            // $FlowFixMe
            if (column.remapping.has(value)) {
                // $FlowFixMe
                return column.remapping.get(value);
            }

            const remappedValueIsString = typeof remappedValueSample
            if (remappedValueIsString) {
                // A simple way to hide intermediate ticks for a numeral value that has been remapped to a string
                return null;
            }
        }
    }

    if (value == undefined) {
        return null;
    } else if (column && isa(column.special_type, TYPE.URL)) {
        return formatUrl(value, options);
    } else if (column && isa(column.special_type, TYPE.Email)) {
        return formatEmail(value, options);
    } else if (column && isa(column.base_type, TYPE.Time)) {
        return formatTimeValue(value);
    } else if (column && column.unit != null) {
        return formatTimeWithUnit(value, column.unit, options);
    } else if (isDate(column) || moment.isDate(value) || moment.isMoment(value) || moment(value, ["YYYY-MM-DD'T'HH:mm:ss.SSSZ"], true).isValid()) {
        return parseTimestamp(value, column && column.unit).format("LLLL");
    } else if (typeof value === "string") {
        return formatStringFallback(value, options);
    } else if (typeof value === "number") {
        const formatter = isCoordinate(column) ?
            formatCoordinate :
            formatNumber;
        const range = rangeForValue(value, options.column);
        if (range) {
            return formatRange(range, formatter, options);
        } else {
            return formatter(value, options);
        }
    } else if (typeof value === "object") {
        // no extra whitespace for table cells
        return JSON.stringify(value);
    } else {
        return String(value);
    }
}

export function formatColumn(column: Column): string {
    if (!column) {
        return "";
    } else if (column.remapped_to_column != null) {
        // $FlowFixMe: remapped_to_column is a special field added by Visualization.jsx
        return formatColumn(column.remapped_to_column)
    } else {
        let columnTitle = getFriendlyName(column);
        if (column.unit && column.unit !== "default") {
            columnTitle += ": " + capitalize(column.unit.replace(/-/g, " "))
        }
        return columnTitle;
    }
}

export function formatField(field: Field): string {
    if (!field) {
        return "";
    } else if (field.dimensions && field.dimensions.name) {
        return field.dimensions.name;
    } else {
        return field.display_name || field.name;
    }
}

// $FlowFixMe
export function singularize(...args) {
    return inflection.singularize(...args);
}

// $FlowFixMe
export function pluralize(...args) {
    return inflection.pluralize(...args);
}

// $FlowFixMe
export function capitalize(...args) {
    return inflection.capitalize(...args);
}

// $FlowFixMe
export function inflect(...args) {
    return inflection.inflect(...args);
}

// $FlowFixMe
export function titleize(...args) {
    return inflection.titleize(...args);
}

// $FlowFixMe
export function humanize(...args) {
    return inflection.humanize(...args);
}

export function duration(milliseconds: number) {
    if (milliseconds < 60000) {
        let seconds = Math.round(milliseconds / 1000);
        return seconds + " " + inflect("second", seconds);
    } else {
        let minutes = Math.round(milliseconds / 1000 / 60);
        return minutes + " " + inflect("minute", minutes);
    }
}

// Removes trailing "id" from field names
export function stripId(name: string) {
    return name && name.replace(/ id$/i, "");
}

export function slugify(name: string) {
    return name && name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

export function assignUserColors(userIds: number[], currentUserId: number, colorClasses: string[] = ['bg-brand', 'bg-purple', 'bg-error', 'bg-green', 'bg-gold', 'bg-grey-2']) {
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

export function formatSQL(sql: string) {
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
