import d3 from "d3";
import inflection from "inflection";
import moment from "moment";
import React from "react";

var precisionNumberFormatter = d3.format(".2r");
var fixedNumberFormatter = d3.format(",.f");

var decimalDegreesFormatter = d3.format(".08f");

export function formatNumber(number) {
    if (number > -1 && number < 1) {
        // numbers between 1 and -1 round to 2 significant digits with extra 0s stripped off
        return precisionNumberFormatter(number).replace(/\.?0+$/, "");
    } else {
        // anything else rounds to at most 2 decimal points
        return fixedNumberFormatter(d3.round(number, 2));
    }
}

export function formatScalar(scalar) {
    if (typeof scalar === "number") {
        return formatNumber(scalar);
    } else {
        return String(scalar);
    }
}

function formatMajorMinor(major, minor, majorWidth = 3) {
    return (
        <span>
            <span style={{minWidth: majorWidth + "em"}} className="inline-block text-right text-bold">{major}</span>
            {" - "}
            <span>{minor}</span>
        </span>
    );
}

export function formatWithUnit(value, unit) {
    let m = moment(value);
    switch (unit) {
        case "hour": // 12 AM - January 1, 2015
            return formatMajorMinor(m.format("h A"), m.format("MMMM D, YYYY"));
        case "day": // January 1, 2015
            return m.format("MMMM D, YYYY");
        case "week": // 1st - 2015
            return formatMajorMinor(m.format("wo"), m.format("YYYY"));
        case "month": // January 2015
            return <div><span className="text-bold">{m.format("MMMM")}</span> {m.format("YYYY")}</div>;
        case "year": // 2015
            return String(value);
        case "quarter": // Q1 - 2015
            return formatMajorMinor(m.format("[Q]Q"), m.format("YYYY"), 0);
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

export function formatValue(value, column) {
    if (value == undefined) {
        return null
    } else if (column && column.unit != null) {
        return formatWithUnit(value, column.unit)
    } else if (typeof value === "string") {
        return value;
    } else if (typeof value === "number") {
        if (column && (column.special_type === "latitude" || column.special_type === "longitude")) {
            return decimalDegreesFormatter(value)
        } else {
            return formatNumber(value);
        }
    } else if (typeof value === "object") {
        // no extra whitespace for table cells
        return JSON.stringify(value);
    } else {
        return String(value);
    }
}

export function formatValueString(value, column) {
    var e = document.createElement("div");
    React.render(<div>{formatValue(value, column)}</div>, e);
    return e.textContent;
}

export function singularize(...args) {
    return inflection.singularize(...args);
}

export function capitalize(...args) {
    return inflection.capitalize(...args);
}

// Removes trailing "id" from field names
export function stripId(name) {
    return name && name.replace(/ id$/i, "");
}
