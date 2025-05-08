import type { DatabaseId } from "metabase-types/api/database";

export type GenerateSqlQueryRequest = {
  prompt: string;
  database_id: DatabaseId;
};

export type GenerateSqlQueryResponse = {
  generated_sql: string;
};
