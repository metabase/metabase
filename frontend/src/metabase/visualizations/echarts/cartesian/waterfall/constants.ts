// Start of a waterfall bar
export const WATERFALL_START_KEY = "start" as const;
// End of a waterfall bar
export const WATERFALL_END_KEY = "end" as const;
// Value of a waterfall bar which is end - start
export const WATERFALL_VALUE_KEY = "value" as const;
// Total value of a waterfall chart
export const WATERFALL_TOTAL_KEY = "total" as const;

// Candlestick chart which is suitable for the Waterfall chart requires having four keys, so we need to add these two
export const WATERFALL_START_2_KEY = `${WATERFALL_START_KEY}_2` as const;
export const WATERFALL_END_2_KEY = `${WATERFALL_END_KEY}_2` as const;
