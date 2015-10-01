"use strict";

import d3 from "d3";
import inflection from "inflection";

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

export function formatCell(value, column) {
    if (value == undefined) {
        return null
    } else if (typeof value === "string") {
        return value;
    } else if (typeof value === "number") {
        if (column.special_type === "latitude" || column.special_type === "longitude") {
            return decimalDegreesFormatter(value)
        } else {
            return formatNumber(value);
        }
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
