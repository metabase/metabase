import { NULL_CHAR } from "../constants/dataset";

// Start of a waterfall bar
export const WATERFALL_START_KEY = "start";
// End of a waterfall bar
export const WATERFALL_END_KEY = "end";
// Value of a waterfall bar which is end - start
export const WATERFALL_VALUE_KEY = "value";
// Total value of a waterfall chart
export const WATERFALL_TOTAL_KEY = "total";

// Candlestick chart which is suitable for the Waterfall chart requires having four keys, so we need to add these two
export const WATERFALL_START_2_KEY = `${WATERFALL_START_KEY}_2`;
export const WATERFALL_END_2_KEY = `${WATERFALL_END_KEY}_2`;

export const WATERFALL_DATA_KEYS: string[] = [
  WATERFALL_START_KEY,
  WATERFALL_END_KEY,
  WATERFALL_START_2_KEY,
  WATERFALL_END_2_KEY,
  WATERFALL_TOTAL_KEY,
  WATERFALL_VALUE_KEY,
];

export const WATERFALL_LABELS_SERIES_ID = `${NULL_CHAR}waterfall_labels`;
