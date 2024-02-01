import type { SearchResult } from "./search";

export interface Bookmark extends SearchResult {
  bookmark_id: string; // format is {model}-{id}
}
