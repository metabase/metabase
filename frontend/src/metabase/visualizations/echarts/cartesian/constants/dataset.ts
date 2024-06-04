// We prefix misc data keys we add to avoid possible collisions with series data
// keys
export const NULL_CHAR = "\0" as const;

// On stacked charts we show labels with the total value of stacks that are
// grouped by sign
export const POSITIVE_STACK_TOTAL_DATA_KEY =
  `${NULL_CHAR}_positiveStackTotal` as const;
export const NEGATIVE_STACK_TOTAL_DATA_KEY =
  `${NULL_CHAR}_negativeStackTotal` as const;

export const POSITIVE_BAR_DATA_LABEL_KEY_SUFFIX = `${NULL_CHAR}_positive_bar_data_label`;
export const NEGATIVE_BAR_DATA_LABEL_KEY_SUFFIX = `${NULL_CHAR}_negative_bar_data_label`;

// Key of x-axis values
export const X_AXIS_DATA_KEY = `${NULL_CHAR}_x` as const;

// In some cases a datum in `chartModel.transformedDataset` may include this
// key, its value is equal to the index of that same datum in the original
// dataset (e.g. `chartModel.dataset`)
export const ORIGINAL_INDEX_DATA_KEY =
  `${NULL_CHAR}_original_dataset_key` as const;

// For ticks we want to pick the largest interval that exist 3 times in the
// range. For example, if data has week granularity but the range is more than 3
// months, we want to show monthly ticks.
export const TICKS_INTERVAL_THRESHOLD = 3;

// ECharts replaces null valeus with empty strings which makes it impossible to
// distinguish between null and empty string so we have to use another special
// value for nulls.
export const ECHARTS_CATEGORY_AXIS_NULL_VALUE = `${NULL_CHAR}_NULL` as const;

export const GOAL_LINE_SERIES_ID = `${NULL_CHAR}_goal_line` as const;

export const TIMELINE_EVENT_SERIES_ID = `${NULL_CHAR}_timeline_events`;

export const TIMELINE_EVENT_DATA_NAME = `${NULL_CHAR}_timeline_event`;
