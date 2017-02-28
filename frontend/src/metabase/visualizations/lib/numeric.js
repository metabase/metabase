/* @flow weak */

import { isNumeric } from "metabase/lib/schema_metadata";

export function dimensionIsNumeric({ cols, rows }, i = 0) {
    return isNumeric(cols[i]) || typeof (rows[0] && rows[0][i]) === "number";
}

export function precision(a) {
    if (!isFinite(a)) {
        return 0;
    }
    if (!a) {
        return 0;
    }
    var e = 1;
    while (Math.round(a / e) !== (a / e)) {
        e /= 10;
    }
    while (Math.round(a / Math.pow(10, e)) === (a / Math.pow(10, e))) {
        e *= 10;
    }
    return e;
}

export function computeNumericDataInverval(xValues) {
    let bestPrecision = Infinity;
    for (const value of xValues) {
        let p = precision(value) || 1;
        if (p < bestPrecision) {
            bestPrecision = p;
        }
    }
    return bestPrecision;
}

// logTickFormat(chart.xAxis())
export function logTickFormat(axis) {
    let superscript = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    let formatPower = (d) => (d + "").split("").map((c) => superscript[c]).join("");
    let formatTick = (d) =>  10 + formatPower(Math.round(Math.log(d) / Math.LN10));
    axis.tickFormat(formatTick);
}
