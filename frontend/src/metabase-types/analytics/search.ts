import type { SearchContext } from "metabase-types/api";

type SearchEventSchema = {
  event: string;
  runtime_milliseconds?: number | null;
  context?: string | null;
  total_results?: number | null;
  page_results?: number | null;
  position?: number | null;
  target_type?: string | null;
  content_type?: string[] | null;
  creator?: boolean | null;
  last_editor?: boolean | null;
  creation_date?: boolean | null;
  last_edit_date?: boolean | null;
  verified_items?: boolean | null;
  search_native_queries?: boolean | null;
  search_archived?: boolean | null;
};

type ValidateEvent<
  T extends SearchEventSchema &
    Record<Exclude<keyof T, keyof SearchEventSchema>, never>,
> = T;

type SearchContentType =
  | "dashboard"
  | "card"
  | "dataset"
  | "segment"
  | "metric"
  | "collection"
  | "database"
  | "table"
  | "action"
  | "indexed-entity";

type SnowplowSearchContext =
  | "search-app"
  | "search-bar"
  | "command-palette"
  | "entity-picker";

// TODO: once we've finalized the new context names, we should add them to the Snowplow schema.
// It would also be good to use an exclusion list, so that this is easier to maintain when new context are added.
const REGISTERED_SEARCH_CONTEXTS = [
  "available-models",
  "command-palette",
  "entity-picker",
  "metabot",
  "metrics-browser",
  "model-upload",
  "model-browser",
  "question-picker",
  "search-app",
  "search-bar",
  "skip-token", // never sent to the backend, used in a sentinel payload
  "strategy-editor",
  "search-model-filter",
  "action-picker",
] as const;

export function safeSearchContext(
  value: SearchContext,
): SnowplowSearchContext | null {
  if ((REGISTERED_SEARCH_CONTEXTS as readonly string[]).includes(value)) {
    return value as SnowplowSearchContext;
  } else {
    throw new Error(`Unrecognized search context "${value}"`);
  }
}

export type SearchQueryEvent = ValidateEvent<{
  event: "search_query";
  runtime_milliseconds: number;
  context: SnowplowSearchContext | null;
  total_results: number;
  page_results: number | null;
  content_type: SearchContentType[] | null;
  creator: boolean;
  last_editor: boolean;
  creation_date: boolean;
  last_edit_date: boolean;
  verified_items: boolean;
  search_native_queries: boolean;
  search_archived: boolean;
}>;

export type SearchClickEvent = ValidateEvent<{
  event: "search_click";
  position: number;
  target_type: "item" | "view_more";
  context: SnowplowSearchContext | null;
}>;

export type SearchEvent = SearchQueryEvent | SearchClickEvent;
