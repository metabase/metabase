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
// snowplow/iglu-client-embedded/schemas/com.metabase/search/jsonschema/1-1-4
// "other" (kept last) is the catch-all bucket for models that aren't tracked content types.
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
  "exploration",
  "transform",
  "other",
] as const;

type SearchContentType = (typeof SNOWPLOW_CONTENT_TYPES)[number];

const SNOWPLOW_CONTENT_TYPE_SET = new Set<string>(SNOWPLOW_CONTENT_TYPES);

const isSearchContentType = (model: string): model is SearchContentType =>
  SNOWPLOW_CONTENT_TYPE_SET.has(model);

// Maps arbitrary model strings to snowplow `content_type`, bucketing untracked values into "other"
// and de-duplicating.
export const toSnowplowContentTypes = (
  models: string[] | null | undefined,
): SearchContentType[] | null =>
  models == null
    ? null
    : Array.from(
        new Set(
          models.map((model) => (isSearchContentType(model) ? model : "other")),
        ),
      );

// The snowplow `search` schema's `context` enum; keep in sync with
// snowplow/iglu-client-embedded/schemas/com.metabase/search/jsonschema/1-1-4
// Add a new UI context here (and to iglu), or to `PENDING_CONTEXTS` to emit it as "other" until iglu catches up.
// Kept nullable on the wire (though always sent non-null) to avoid a MODEL version bump that forks events to a new table.
type SnowplowSearchContext =
  | "basic-actions"
  | "browse"
  | "command-palette"
  | "data-picker"
  | "dependencies"
  | "document"
  | "embedding-setup"
  | "entity-picker"
  | "library"
  | "model-migration"
  | "search-app"
  | "search-bar"
  | "type-filter"
  | "other"; // catch-all, kept last rather than alphabetized with the real surfaces

// Frontend contexts not yet in the snowplow enum, emitted as `"other"` until the iglu schema catches up.
const PENDING_CONTEXTS = [] as const satisfies readonly SearchContext[];

// Compile-time guard: every `SearchContext` must be in the snowplow enum or in `PENDING_CONTEXTS`.
const _allContextsHandled: Exclude<
  SearchContext,
  SnowplowSearchContext | (typeof PENDING_CONTEXTS)[number]
> extends never
  ? true
  : "Add the missing SearchContext to the snowplow enum or to PENDING_CONTEXTS" =
  true;

export const toSnowplowContext = (
  context: SearchContext,
): SnowplowSearchContext =>
  // Unjustified type cast. FIXME
  (PENDING_CONTEXTS as readonly SearchContext[]).includes(context)
    ? "other"
    : // safe: the guard above proves every non-pending context is in the snowplow enum
      (context as SnowplowSearchContext);

export type SearchQueryEvent = ValidateEvent<{
  event: "search_query";
  search_term_hash: string | null;
  search_term: string | null;
  runtime_milliseconds: number;
  context: SnowplowSearchContext;
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
  context: SnowplowSearchContext;
  search_engine: string | null;
  request_id: string | null;
  entity_model: string | null;
  entity_id: number | null;
  search_term_hash: string | null;
  search_term: string | null;
}>;

export type SearchEvent = SearchQueryEvent | SearchClickEvent;
