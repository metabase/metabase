/* @flow weak */

import { isNumeric } from "metabase/lib/schema_metadata";

export function dimensionIsNumeric({ cols, rows }, i = 0) {
  return isNumeric(cols[i]) || typeof (rows[0] && rows[0][i]) === "number";
}

// We seem to run into float bugs if we get any more precise than this.
const SMALLEST_PRECISION_EXP = -14;

export function precision(a) {
  if (!isFinite(a)) {
    return 0;
  }
  if (!a) {
    return 0;
  }

  // Find the largest power of ten needed to evenly divide the value. We start
  // with the power of ten greater than the value and walk backwards until we
  // hit our limit of SMALLEST_PRECISION_EXP or isMultipleOf returns true.
  let e = Math.ceil(Math.log10(Math.abs(a)));
  while (e > SMALLEST_PRECISION_EXP && !isMultipleOf(a, Math.pow(10, e))) {
    e--;
  }
  return Math.pow(10, e);
}

export function decimalCount(a) {
  if (!isFinite(a)) {
    return 0;
  }
  let e = 1,
    p = 0;
  while (Math.round(a * e) / e !== a) {
    e *= 10;
    p++;
  }
  return p;
}

export function computeNumericDataInverval(xValues) {
  let bestPrecision = Infinity;
  for (const value of xValues) {
    const p = precision(value) || 1;
    if (p < bestPrecision) {
      bestPrecision = p;
    }
  }
  return bestPrecision;
}

// logTickFormat(chart.xAxis())
export function logTickFormat(axis) {
  const superscript = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const formatPower = d =>
    (d + "")
      .split("")
      .map(c => superscript[c])
      .join("");
  const formatTick = d => 10 + formatPower(Math.round(Math.log(d) / Math.LN10));
  axis.tickFormat(formatTick);
}

export const isMultipleOf = (value, base) => {
  // Ideally we could use Number.EPSILON as constant diffThreshold here.
  // However, we sometimes see very small errors that are bigger than EPSILON.
  // For example, when called 1.23456789 and 1e-8 we see a diff of ~1e-16.
  const diffThreshold = Math.pow(10, SMALLEST_PRECISION_EXP);
  return Math.abs(value - Math.round(value / base) * base) < diffThreshold;
};
