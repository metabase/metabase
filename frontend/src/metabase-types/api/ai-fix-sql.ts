import type { DatasetQuery } from "metabase-types/api/query";

export type AiFixSqlRequest = {
  query: DatasetQuery;
  error_message: string;
};

export type AiFixSqlResponse = {
  fixes: AiSqlFix[];
};

export type AiSqlFix = {
  line_number: number;
  fixed_sql: string;
};
