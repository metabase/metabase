// One search tool per matcher, plus `search`, the single tool they replaced, which older conversations still show.
export const SEARCH_TOOL_NAMES: ReadonlySet<string> = new Set([
  "search",
  "semantic_search",
  "fulltext_search",
  "substring_search",
]);
export const SAVE_ENTITY_TOOL_NAME = "save_entity";
export const RESOURCE_TOOL_NAME = "read_resource";

export const REASONING_EXACT_THRESHOLD_MS = 5000;
export const PREVIEW_MIN_MS = 600;
export const NOW_TICK_MS = 150;
