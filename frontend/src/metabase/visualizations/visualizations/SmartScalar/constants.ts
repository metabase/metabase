export const TEXT_SPACING = 4;

export const MAX_COMPARISONS = 3;

export const COMPARISON_TYPES = {
  ANOTHER_COLUMN: "anotherColumn",
  PREVIOUS_VALUE: "previousValue",
  PREVIOUS_PERIOD: "previousPeriod",
  PERIODS_AGO: "periodsAgo",
  STATIC_NUMBER: "staticNumber",
} as const;

export const VIZ_SETTINGS_DEFAULTS = {
  "scalar.switch_positive_negative": false,
  "scalar.compact_primary_number": false,
  "scalar.show_comparison_value": true,
};
