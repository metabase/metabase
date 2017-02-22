export const VALID_OPERATORS = new Set([
    '+',
    '-',
    '*',
    '/'
]);

export const VALID_AGGREGATIONS = new Map(Object.entries({
    "count": "Count",
    "cum_count": "CumulativeCount",
    "sum": "Sum",
    "cum_sum": "CumulativeSum",
    "distinct": "Distinct",
    "stddev": "StandardDeviation",
    "avg": "Average",
    "min": "Min",
    "max": "Max"
}));

export const NULLARY_AGGREGATIONS = ["count", "cum_count"];
export const UNARY_AGGREGATIONS = ["sum", "cum_sum", "distinct", "stddev", "avg", "min", "max"];
