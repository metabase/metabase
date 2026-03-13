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

// keep in sync with the `search` snowplow schema
type SearchContentType =
  | "dashboard"
  | "card"
  | "dataset"
  | "segment"
  | "measure"
  | "metric"
  | "collection"
  | "database"
  | "table"
  | "action"
  | "indexed-entity"
  | "document"
  | "transform";

type SearchContext =
  | "search-app"
  | "search-bar"
  | "command-palette"
  | "entity-picker";

export type SearchQueryEvent = ValidateEvent<{
  event: "search_query";
  search_term_hash: string | null;
  search_term: string | null;
  runtime_milliseconds: number;
  context: SearchContext | null;
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
  context: SearchContext | null;
  search_engine: string | null;
  request_id: string | null;
  entity_model: string | null;
  entity_id: number | null;
  search_term_hash: string | null;
  search_term: string | null;
}>;

export type SearchEvent = SearchQueryEvent | SearchClickEvent;
