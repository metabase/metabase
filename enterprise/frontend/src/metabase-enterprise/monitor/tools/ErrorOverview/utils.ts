import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type {
  Dataset,
  InternalDatasetQuery,
  RowValue,
} from "metabase-types/api";

import type {
  ErroringCard,
  ErroringQuestionsFilters,
  ErroringQuestionsSorting,
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
  search: "",
};

export const DEFAULT_SORTING: ErroringQuestionsSorting = {
  column: "last_run_at",
  direction: "desc",
};

export function getErroringQuestionsQuery(
  { search }: ErroringQuestionsFilters,
  { column, direction }: ErroringQuestionsSorting,
  page: number,
): InternalDatasetQuery {
  return {
    type: "internal",
    fn: "metabase-enterprise.audit-app.pages.queries/bad-table",
    args: [search, column, direction],
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
  };
}

export function getErroringQuestions(dataset: Dataset): ErroringCard[] {
  const { cols, rows } = dataset.data;
  const indexByName: Record<string, number> = {};
  cols.forEach((col, index) => {
    indexByName[col.name] = index;
  });

  return rows.flatMap((row) => {
    const value = (name: string) => row[indexByName[name]];
    const id = asCount(value("card_id"));
    if (id == null) {
      return [];
    }
    return {
      id,
      card_name: asText(value("card_name")) ?? "",
      error_substr: asText(value("error_substr")) ?? "",
      collection_name: asText(value("collection_name")),
      database_name: asText(value("database_name")),
      schema_name: asText(value("schema_name")),
      table_name: asText(value("table_name")),
      last_run_at: asText(value("last_run_at")),
      total_runs: asCount(value("total_runs")),
      num_dashboards: asCount(value("num_dashboards")),
      user_name: asText(value("user_name")),
      updated_at: asText(value("updated_at")),
    };
  });
}

function asText(value: RowValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function asCount(value: RowValue | undefined): number | null {
  return typeof value === "number" ? value : null;
}
