import type { SortingState } from "@tanstack/react-table";
import { t } from "ttag";

import { DEPENDENCY_SORT_COLUMNS } from "metabase-types/api";

import type { DependencySortOptions } from "../../../types";
import {
  getDependentsErrorsColumn,
  getDependentsWithErrorsColumn,
  getLocationColumn,
  getNameColumn,
} from "../../DependencyTable";
import type { DependencyListMode } from "../types";

export function getColumns(mode: DependencyListMode) {
  return [
    getNameColumn(mode === "broken" ? t`Dependency` : t`Name`),
    getLocationColumn(),
    ...(mode === "broken" ? [getDependentsErrorsColumn()] : []),
    ...(mode === "broken" ? [getDependentsWithErrorsColumn()] : []),
  ];
}

export function getColumnWidths(mode: DependencyListMode): number[] {
  if (mode === "broken") {
    return [0.3, 0.3, 0.3, 0.1];
  } else {
    return [0.5, 0.5];
  }
}

export function getSortingState(
  sortOptions: DependencySortOptions | undefined,
): SortingState {
  return sortOptions?.column != null
    ? [{ id: sortOptions.column, desc: sortOptions.direction === "desc" }]
    : [];
}

export function getSortingOptions(
  sortingState: SortingState,
): DependencySortOptions | undefined {
  if (sortingState.length === 0) {
    return undefined;
  }

  const { id, desc } = sortingState[0];
  const column = DEPENDENCY_SORT_COLUMNS.find((column) => column === id);
  if (column == null) {
    return undefined;
  }

  return {
    column,
    direction: desc ? "desc" : "asc",
  };
}

export function getNotFoundMessage(mode: DependencyListMode) {
  return mode === "broken"
    ? t`No broken dependencies found`
    : t`No unreferenced entities found`;
}
