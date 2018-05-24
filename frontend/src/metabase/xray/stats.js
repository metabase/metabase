// keys for common values interesting for most folks
export const VALUES_OVERVIEW = [
  "min",
  "earliest", // date field min is expressed as earliest
  "max",
  "latest", // date field max is expressed as latest
  "count",
  "sum",
  "cardinality",
  "sd",
  "nil%",
  "mean",
  "median",
  "mean-median-spread",
];

// keys for common values interesting for stat folks
export const STATS_OVERVIEW = [
  "kurtosis",
  "skewness",
  "entropy",
  "var",
  "sum-of-square",
];

export const ROBOTS = [
  "cardinality-vs-count",
  "positive-definite?",
  "has-nils?",
  "all-distinct?",
];

// periods we care about for showing periodicity
export const PERIODICITY = ["day", "week", "month", "hour", "quarter"];
