import type { SuggestionModel } from "./types";

export const LINK_SEARCH_MODELS: SuggestionModel[] = [
  "card",
  "dataset",
  "metric",
  "dashboard",
  "database",
  "table",
  "collection",
  "document",
];

export const EMBED_SEARCH_MODELS: SuggestionModel[] = ["card", "dataset"];

export const LINK_SEARCH_LIMIT = 5;

export const USER_SEARCH_LIMIT = LINK_SEARCH_LIMIT;

export const DROP_ZONE_COLOR = "var(--mb-color-core-brand)";

/** Maximum number of card embeds a FlexContainer group may hold side-by-side. */
export const MAX_GROUP_SIZE = 3;

/** Class name used to prevent editor typography styles from affecting embedded content. */
export const EDITOR_STYLE_BOUNDARY_CLASS = "editor-style-boundary";
