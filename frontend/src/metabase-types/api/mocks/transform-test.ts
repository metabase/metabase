import type {
  ListTransformTestRunsResponse,
  TransformTest,
  TransformTestEmptyExpectation,
  TransformTestEqualsExpectation,
  TransformTestRowsData,
  TransformTestRun,
  TransformTestRunUser,
  TransformTestRunWithUser,
  TransformTestSqlData,
} from "metabase-types/api";

export function createMockTransformTestRowsData(
  opts?: Partial<TransformTestRowsData>,
): TransformTestRowsData {
  return {
    format: "rows",
    columns: [{ name: "id", cast_type: "int" }],
    rows: [{ id: 1 }],
    ...opts,
  };
}

export function createMockTransformTestSqlData(
  opts?: Partial<TransformTestSqlData>,
): TransformTestSqlData {
  return {
    format: "sql",
    sql: "SELECT 1 AS id",
    ...opts,
  };
}

type TransformTestEqualsRowsExpectation = Extract<
  TransformTestEqualsExpectation,
  { format: "rows" }
>;

export function createMockTransformTestEqualsExpectation(
  opts?: Partial<TransformTestEqualsRowsExpectation>,
): TransformTestEqualsRowsExpectation {
  return {
    type: "equals",
    name: "output rows",
    ...createMockTransformTestRowsData(),
    ...opts,
  };
}

export function createMockTransformTestEmptyExpectation(
  opts?: Partial<TransformTestEmptyExpectation>,
): TransformTestEmptyExpectation {
  return {
    type: "empty",
    name: "no rows",
    sql: "SELECT * FROM output WHERE id IS NULL",
    ...opts,
  };
}

export function createMockTransformTestRun(
  opts?: Partial<TransformTestRun>,
): TransformTestRun {
  return {
    id: 1,
    transform_test_id: 1,
    initiated_by: 1,
    start_time: "2026-01-01T00:00:00Z",
    end_time: "2026-01-01T00:00:02Z",
    status: "passed",
    last_heartbeat: "2026-01-01T00:00:02Z",
    ...opts,
  };
}

export function createMockTransformTestRunUser(
  opts?: Partial<TransformTestRunUser>,
): TransformTestRunUser {
  return {
    id: 1,
    email: "user@example.com",
    first_name: "Test",
    last_name: "User",
    common_name: "Test User",
    ...opts,
  };
}

export function createMockTransformTestRunWithUser(
  opts?: Partial<TransformTestRunWithUser>,
): TransformTestRunWithUser {
  return {
    ...createMockTransformTestRun(),
    initiated_by_user: createMockTransformTestRunUser(),
    ...opts,
  };
}

export function createMockListTransformTestRunsResponse(
  opts?: Partial<ListTransformTestRunsResponse>,
): ListTransformTestRunsResponse {
  return {
    data: [],
    limit: 20,
    offset: 0,
    total: 0,
    ...opts,
  };
}

export function createMockTransformTest(
  opts?: Partial<TransformTest>,
): TransformTest {
  return {
    id: 1,
    entity_id: "transform-test-1",
    transform_id: 1,
    creator_id: 1,
    name: "Test",
    description: null,
    inputs: [
      {
        table: { schema: "public", name: "orders" },
        ...createMockTransformTestRowsData(),
      },
    ],
    expectations: [createMockTransformTestEqualsExpectation()],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    last_run: null,
    ...opts,
  };
}
