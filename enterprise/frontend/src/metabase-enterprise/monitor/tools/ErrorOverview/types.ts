import type { Sorting } from "metabase/utils/sorting";
import type { CardId } from "metabase-types/api";

export type ErroringCard = {
  id: CardId;
  card_name: string;
  error_substr: string;
  collection_name: string | null;
  database_name: string | null;
  schema_name: string | null;
  table_name: string | null;
  last_run_at: string | null;
  total_runs: number | null;
  num_dashboards: number | null;
  user_name: string | null;
  updated_at: string | null;
};

export type ErroringQuestionsFilters = {
  search: string;
};

export const SORT_COLUMNS = [
  "card_name",
  "error_substr",
  "collection_name",
  "database_name",
  "schema_name",
  "table_name",
  "last_run_at",
  "total_runs",
  "num_dashboards",
  "user_name",
  "updated_at",
] as const;

export type ErroringQuestionsSortColumn = (typeof SORT_COLUMNS)[number];

export type ErroringQuestionsSorting = Sorting<ErroringQuestionsSortColumn>;
