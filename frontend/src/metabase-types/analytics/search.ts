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

type SearchContext =
  | "search-app"
  | "search-bar"
  | "command-palette"
  | "entity-picker";

export type SearchQueryEvent = ValidateEvent<{
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
}>;

export type SearchClickEvent = ValidateEvent<{
  event: "search_click";
  position: number;
  target_type: "item" | "view_more";
  context: SearchContext | null;
}>;

export type SearchEvent = SearchQueryEvent | SearchClickEvent;
