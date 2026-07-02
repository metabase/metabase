import type { SearchContext, SearchModel } from "metabase-types/api";

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
  search_engine?: string | null;
  request_id?: string | null;
  offset?: number | null;
  entity_model?: string | null;
  entity_id?: number | null;
  search_term_hash?: string | null;
  search_term?: string | null;
};

type ValidateEvent<
  T extends SearchEventSchema &
    Record<Exclude<keyof T, keyof SearchEventSchema>, never>,
> = T;

// The snowplow `search` schema's `content_type` enum; keep in sync with
// snowplow/iglu-client-embedded/schemas/com.metabase/search/jsonschema/1-1-3
const SNOWPLOW_CONTENT_TYPES = [
  "dashboard",
  "card",
  "dataset",
  "segment",
  "measure",
  "metric",
  "collection",
  "database",
  "table",
  "action",
  "indexed-entity",
  "document",
  "transform",
] as const;

type SearchContentType = (typeof SNOWPLOW_CONTENT_TYPES)[number];

const SNOWPLOW_CONTENT_TYPE_SET = new Set<string>(SNOWPLOW_CONTENT_TYPES);

// Maps a search request's `models` to snowplow `content_type`, de-duplicating and dropping any model
// that isn't a tracked content type. Today every `SearchModel` is a tracked content type, so nothing is
// dropped; the follow-up that adds the `"other"` bucket (and schema 1-1-4) will route untracked there.
export const toSnowplowContentTypes = (
  models: SearchModel[] | null | undefined,
): SearchContentType[] | null =>
  models == null
    ? null
    : Array.from(new Set(models)).filter((model): model is SearchContentType =>
        SNOWPLOW_CONTENT_TYPE_SET.has(model),
      );

// The snowplow `search` schema's `context` enum; keep in sync with
// snowplow/iglu-client-embedded/schemas/com.metabase/search/jsonschema/1-1-3
// Only the surfaces already in the schema are published. Every other `SearchContext` is listed in
// `PENDING_CONTEXTS` and suppressed (emitted as `null`) until the iglu schema is widened — see the
// stacked follow-up that adds schema 1-1-4 and an `"other"` catch-all bucket.
type SnowplowSearchContext =
  | "command-palette"
  | "entity-picker"
  | "search-app"
  | "search-bar";

// `SearchContext`s not yet in the snowplow enum; suppressed (emitted as `null`) until the schema catches up.
const PENDING_CONTEXTS = [
  "basic-actions",
  "browse",
  "data-picker",
  "dependencies",
  "document",
  "embedding-setup",
  "library",
  "model-migration",
  "type-filter",
] as const satisfies readonly SearchContext[];

// Compile-time guard: every `SearchContext` must be in the snowplow enum or in `PENDING_CONTEXTS`.
const _allContextsHandled: Exclude<
  SearchContext,
  SnowplowSearchContext | (typeof PENDING_CONTEXTS)[number]
> extends never
  ? true
  : "Add the missing SearchContext to the snowplow enum or to PENDING_CONTEXTS" =
  true;

// Maps a `SearchContext` to its snowplow `context`, or `null` for a pending/absent context (the wire
// schema's `context` is nullable). A `null` result also gates request tracking — see api/search.ts.
export const toSnowplowContext = (
  context: SearchContext | null | undefined,
): SnowplowSearchContext | null =>
  context == null ||
  (PENDING_CONTEXTS as readonly SearchContext[]).includes(context)
    ? null
    : (context as SnowplowSearchContext);

export type SearchQueryEvent = ValidateEvent<{
  event: "search_query";
  search_term_hash: string | null;
  search_term: string | null;
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
  search_engine: string | null;
  request_id: string | null;
  offset: number | null;
}>;

export type SearchClickEvent = ValidateEvent<{
  event: "search_click";
  position: number;
  target_type: "item" | "view_more";
  context: SnowplowSearchContext | null;
  search_engine: string | null;
  request_id: string | null;
  entity_model: string | null;
  entity_id: number | null;
  search_term_hash: string | null;
  search_term: string | null;
}>;

export type SearchEvent = SearchQueryEvent | SearchClickEvent;
