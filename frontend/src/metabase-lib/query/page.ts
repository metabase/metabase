import * as ML from "cljs/metabase.lib.js";

import type { Query } from "./types";

export type Page = {
  /** 1-indexed page number. `{ page: 1, items: 10 }` = rows 1-10. */
  page: number;
  items: number;
};

/** Set (or, with `null`, remove) the `:page` clause on a query stage. Drops `:limit` if present. */
export function withPage(
  query: Query,
  stageIndex: number,
  page: Page | null,
): Query {
  return ML.with_page(query, stageIndex, page);
}

/** Return the `:page` clause on a query stage, or `null` if there is none. */
export function currentPage(query: Query, stageIndex: number): Page | null {
  return ML.current_page(query, stageIndex);
}
