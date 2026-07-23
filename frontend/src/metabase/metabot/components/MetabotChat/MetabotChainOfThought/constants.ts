export const SEARCH_TOOL_NAME = "search";
export const SAVE_ENTITY_TOOL_NAME = "save_entity";
export const RESOURCE_TOOL_NAME = "read_resource";

// reasoning under this reads as "Thought briefly"; at or above it we show the
// real elapsed seconds instead
export const REASONING_EXACT_THRESHOLD_MS = 5000;

// each collapsed-header preview label is held on screen at least this long before
// the next replaces it, so a burst of fast tool calls doesn't flash by unreadably
export const PREVIEW_MIN_MS = 600;
