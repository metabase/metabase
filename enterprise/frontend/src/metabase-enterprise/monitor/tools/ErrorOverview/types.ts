import type { CardId } from "metabase-types/api";

export type ErroringQuestion = {
  id: CardId;
  name: string;
  error: string;
  collectionName: string | null;
  databaseName: string | null;
  schemaName: string | null;
  tableName: string | null;
  lastRunAt: string | null;
  totalRuns: number | null;
  dashboardCount: number | null;
  createdBy: string | null;
  updatedAt: string | null;
};

export type ErroringQuestionsFilters = {
  errorFilter: string;
  dbFilter: string;
  collectionFilter: string;
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

export type ErroringQuestionsSorting = {
  column: ErroringQuestionsSortColumn;
  direction: "asc" | "desc";
};
