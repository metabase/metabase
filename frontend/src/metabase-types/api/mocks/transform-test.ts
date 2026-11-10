import type {
  TransformTest,
  TransformTestEmptyExpectation,
  TransformTestEqualsExpectation,
  TransformTestRowsData,
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
