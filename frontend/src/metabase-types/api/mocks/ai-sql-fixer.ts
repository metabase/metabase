import type {
  FixSqlQueryRequest,
  FixSqlQueryResponse,
  SqlQueryFix,
} from "metabase-types/api";

import { createMockNativeDatasetQuery } from "./query";

export function createMockSqlQueryFix(
  opts?: Partial<SqlQueryFix>,
): SqlQueryFix {
  return {
    line_number: 1,
    fixed_sql: "",
    ...opts,
  };
}

export function createMockFixSqlQueryRequest(
  opts?: Partial<FixSqlQueryRequest>,
): FixSqlQueryRequest {
  return {
    query: createMockNativeDatasetQuery(),
    error_message: "",
    ...opts,
  };
}

export function createMockFixSqlQueryResponse(
  opts?: Partial<FixSqlQueryResponse>,
): FixSqlQueryResponse {
  return {
    fixes: [],
    ...opts,
  };
}
