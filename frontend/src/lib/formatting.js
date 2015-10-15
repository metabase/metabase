import d3 from "d3";
import inflection from "inflection";
import moment from "moment";

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

export function formatWithUnit(value, unit) {
    switch (unit) {
        case "hour": // 2015-01-01 12am
            return moment(value).format("YYYY-MM-DD h A");
        case "day": // 2015-01-01
            return moment(value).format("YYYY-MM-DD");
        // case "week":
        case "month": // 2015-01
            return moment(value).format("YYYY-MM");
        case "year": // 2015
            return String(value);
        case "quarter": // 2015 Q1
            return moment(value).format("YYYY [Q]Q");
        case "hour-of-day": // 12 am
            return moment().hour(value).format("h A");
        case "day-of-week": // Sunday
            return moment().day(value - 1).format("dddd");
        case "week-of-year": // 1 2 ... 52 53
            return String(value);
        case "month-of-year": // January
            return moment().month(value - 1).format("MMMM");
    }
    return String(value);
}

export function formatCell(value, column) {
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
