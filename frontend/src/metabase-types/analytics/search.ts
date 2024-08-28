export type SearchContentType =
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

export type SearchContext =
  | "search-app"
  | "search-bar"
  | "command-palette"
  | "entity-picker";

export type SearchQueryEvent = {
  event: "search_query";
  runtime_milliseconds?: number;
  context?: SearchContext;
  total_results?: number;
  page_results?: number;
  content_type?: SearchContentType[];
  creator?: boolean;
  last_editor?: boolean;
  creation_date?: boolean;
  last_edit_date?: boolean;
  verified_items?: boolean;
  search_native_queries?: boolean;
  search_archived?: boolean;
};

export type SearchClickEvent = {
  event: "search_click";
  position: number;
  target_type: "item" | "view_more";
  context?: SearchContext;
};

export type SearchEvent = SearchQueryEvent | SearchClickEvent;
