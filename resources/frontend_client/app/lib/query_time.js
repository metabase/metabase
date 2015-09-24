"use strict";

import moment from "moment";

export function computeFilterTimeRange(filter) {
    let expandedFilter;
    if (filter[0] === "TIME_INTERVAL") {
        expandedFilter = expandTimeIntervalFilter(filter);
    } else {
        expandedFilter = filter;
    }

    let [operator, field, ...values] = expandedFilter;
    let bucketing = parseBucketing(field);

    let start, end;
    if (operator === "=" && values[0]) {
        let point = absolute(values[0]);
        start = point.clone().startOf(bucketing);
        end = point.clone().endOf(bucketing);
    } else if (operator === ">" && values[0]) {
        start = absolute(values[0]).startOf(bucketing);
        end = max();
    } else if (operator === "<" && values[0]) {
        start = min();
        end = absolute(values[0]).endOf(bucketing);
    } else if (operator === "BETWEEN" && values[0] && values[1]) {
        start = absolute(values[0]).startOf(bucketing);
        end = absolute(values[1]).endOf(bucketing);
    }

    return [start, end];
}

export function expandTimeIntervalFilter(filter) {
    let [operator, field, n, unit] = filter;

    if (operator !== "TIME_INTERVAL") {
        throw new Error("translateTimeInterval expects operator TIME_INTERVAL");
    }

    if (n === "current") {
        n = 0;
    } else if (n === "last") {
        n = -1;
    } else if (n === "next") {
        n = 1;
    }

    field = ["datetime_field", field, "as", unit];

    if (n < -1) {
        return ["BETWEEN", field, ["relative_datetime", n, unit], ["relative_datetime", -1, unit]];
    } else if (n > 1) {
        return ["BETWEEN", field, ["relative_datetime", 1, unit], ["relative_datetime", n, unit]];
    } else if (n === 0) {
        return ["=", field, ["relative_datetime", "current"]];
    } else {
        return ["=", field, ["relative_datetime", n, unit]];
    }
}

export function absolute(date) {
    if (typeof date === "string") {
        return moment.utc(date);
    } else if (Array.isArray(date) && date[0] === "relative_datetime") {
        return moment.utc().add(date[1], date[2]);
    } else {
        console.warn("Unknown datetime format", date);
    }
}

function parseBucketing(field) {
    if (Array.isArray(field)) {
        if (field[0] === "datetime_field") {
            return field[3];
        } else {
            console.warn("Unknown field format: ", field);
        }
    }
    return "day";
}

// 271821 BC and 275760 AD and should be far enough in the past/future
function max() {
    return moment.utc(new Date(864000000000000));
}
function min() {
    return moment.utc(new Date(-864000000000000));
}
