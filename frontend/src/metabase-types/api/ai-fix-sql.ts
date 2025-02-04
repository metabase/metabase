import type { DatasetQuery } from "metabase-types/api/query";

export type FixNativeQueryRequest = {
  query: DatasetQuery;
  error_message: string;
};

export type FixNativeQueryResponse = {
  fixes: NativeQueryFix[];
};

export type NativeQueryFix = {
  line_number: number;
  fixed_sql: string;
};
