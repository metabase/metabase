import type {
  GenerateSqlQueryRequest,
  GenerateSqlQueryResponse,
} from "metabase-types/api";

export const createMockGenerateSqlQueryRequest = (
  opts?: Partial<GenerateSqlQueryRequest>,
): GenerateSqlQueryRequest => ({
  prompt: "",
  database_id: 1,
  ...opts,
});

export const createMockGenerateSqlQueryResponse = (
  opts?: Partial<GenerateSqlQueryResponse>,
): GenerateSqlQueryResponse => ({
  generated_sql: "",
  ...opts,
});
