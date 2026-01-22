import type * as Urls from "metabase/lib/urls";

import type { DependencySortOptions } from "../../types";

import { BROKEN_GROUP_TYPES, UNREFERENCED_GROUP_TYPES } from "./constants";
import type { DependencyListMode } from "./types";

export function getAvailableGroupTypes(mode: DependencyListMode) {
  return mode === "broken" ? BROKEN_GROUP_TYPES : UNREFERENCED_GROUP_TYPES;
}

export function getSortOptions({
  sortColumn,
  sortDirection,
}: Urls.DependencyListParams): DependencySortOptions | undefined {
  return sortColumn != null && sortDirection != null
    ? { column: sortColumn, direction: sortDirection }
    : undefined;
}
