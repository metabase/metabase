import type { DatasetQuery } from "metabase-types/api/query";

export type FixSqlQueryRequest = {
  query: DatasetQuery;
  error_message: string;
};

export type FixSqlQueryResponse = {
  fixes: SqlQueryFix[];
};

export type SqlQueryFix = {
  line_number: number;
  fixed_sql: string;
};
