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

type SearchContext =
  | "search-app"
  | "search-bar"
  | "command-palette"
  | "entity-picker";

export type SearchQueryEvent = {
  event: "search_query";
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
};

export type SearchClickEvent = {
  event: "search_click";
  position: number;
  target_type: "item" | "view_more";
  context: SearchContext | null;
};

export type SearchEvent = SearchQueryEvent | SearchClickEvent;
