import type { SortingState } from "@tanstack/react-table";

import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type { Dataset, DatasetQuery, RowValue } from "metabase-types/api";

import {
  type ErroringQuestion,
  type ErroringQuestionsFilters,
  type ErroringQuestionsSortColumn,
  type ErroringQuestionsSorting,
  SORT_COLUMNS,
} from "./types";

export const PAGE_SIZE = 50;

type UrlState = {
  page: number;
};

export const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => ({ page: parsePage(query.page) }),
  serialize: ({ page }) => ({ page: page === 0 ? undefined : String(page) }),
};

function parsePage(param: QueryParam): number {
  const value = getFirstParamValue(param);
  const parsed = parseInt(value || "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export const DEFAULT_FILTERS: ErroringQuestionsFilters = {
  errorFilter: "",
  dbFilter: "",
  collectionFilter: "",
};

export const DEFAULT_SORTING: ErroringQuestionsSorting = {
  column: "last_run_at",
  direction: "desc",
};

// "internal" query shape, which is later converted to DatasetQuery (opaque type).
type InternalDatasetQuery = {
  type: "internal";
  fn: string;
  args: string[];
  limit?: number;
  offset?: number;
};

// Conversion of InternalDatasetQuery to the branded opaque DatasetQuery union,
// which is required for `/api/dataset`.
const toDatasetQuery = (query: InternalDatasetQuery): DatasetQuery =>
  query as unknown as DatasetQuery;

export function getErroringQuestionsQuery(
  { errorFilter, dbFilter, collectionFilter }: ErroringQuestionsFilters,
  { column, direction }: ErroringQuestionsSorting,
  page: number,
): DatasetQuery {
  return toDatasetQuery({
    type: "internal",
    fn: "metabase-enterprise.audit-app.pages.queries/bad-table",
    args: [errorFilter, dbFilter, collectionFilter, column, direction],
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
  });
}

export function getErroringQuestions(dataset: Dataset): ErroringQuestion[] {
  const { cols, rows } = dataset.data;
  const indexByName: Record<string, number> = {};
  cols.forEach((col, index) => {
    indexByName[col.name] = index;
  });

  return rows.map((row) => {
    const value = (name: string) => row[indexByName[name]];
    return {
      id: asCount(value("card_id")) ?? 0,
      name: asText(value("card_name")) ?? "",
      error: asText(value("error_substr")) ?? "",
      collectionName: asText(value("collection_name")),
      databaseName: asText(value("database_name")),
      schemaName: asText(value("schema_name")),
      tableName: asText(value("table_name")),
      lastRunAt: asText(value("last_run_at")),
      totalRuns: asCount(value("total_runs")),
      dashboardCount: asCount(value("num_dashboards")),
      createdBy: asText(value("user_name")),
      updatedAt: asText(value("updated_at")),
    };
  });
}

function asText(value: RowValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function asCount(value: RowValue | undefined): number | null {
  return typeof value === "number" ? value : null;
}

export function getSortingState({
  column,
  direction,
}: ErroringQuestionsSorting): SortingState {
  return [{ id: column, desc: direction === "desc" }];
}

export function getSorting(
  sortingState: SortingState,
  currentSorting: ErroringQuestionsSorting,
): ErroringQuestionsSorting {
  const [firstSort] = sortingState;

  if (firstSort != null && isSortColumn(firstSort.id)) {
    return {
      column: firstSort.id,
      direction: firstSort.desc ? "desc" : "asc",
    };
  }

  return {
    column: currentSorting.column,
    direction: currentSorting.direction === "desc" ? "asc" : "desc",
  };
}

function isSortColumn(id: string): id is ErroringQuestionsSortColumn {
  return SORT_COLUMNS.some((column) => column === id);
}
