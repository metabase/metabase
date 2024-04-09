export const SPACING = 8;

export const ICON_SIZE = 13;

export const TOOLTIP_ICON_SIZE = 11;

export const ICON_MARGIN_RIGHT = SPACING;

export const SCALAR_TITLE_LINE_HEIGHT = 23;

export const PREVIOUS_VALUE_SIZE = 27;

export const PERIOD_HIDE_HEIGHT_THRESHOLD = 70; // determined empirically

export const DASHCARD_HEADER_HEIGHT = 33;

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
};
