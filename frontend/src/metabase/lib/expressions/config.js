import { t } from "c-3po";

export const VALID_OPERATORS = new Set(["+", "-", "*", "/"]);

export const VALID_AGGREGATIONS = new Map(
  Object.entries({
    count: t`Count`,
    cum_count: t`CumulativeCount`,
    sum: t`Sum`,
    cum_sum: t`CumulativeSum`,
    distinct: t`Distinct`,
    stddev: t`StandardDeviation`,
    avg: t`Average`,
    min: t`Min`,
    max: t`Max`,
  }),
);

export const NULLARY_AGGREGATIONS = ["count", "cum_count"];
export const UNARY_AGGREGATIONS = [
  "sum",
  "cum_sum",
  "distinct",
  "stddev",
  "avg",
  "min",
  "max",
];
