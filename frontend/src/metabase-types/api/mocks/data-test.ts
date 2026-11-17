import type {
  DataTestEmptyExpectation,
  DataTestEqualsExpectation,
  DataTestRowsData,
  DataTestSqlData,
  TransformTest,
} from "metabase-types/api";

export function createMockDataTestRowsData(
  opts?: Partial<DataTestRowsData>,
): DataTestRowsData {
  return {
    format: "rows",
    columns: [{ name: "id", cast_type: "int" }],
    rows: [{ id: 1 }],
    ...opts,
  };
}

export function createMockDataTestSqlData(
  opts?: Partial<DataTestSqlData>,
): DataTestSqlData {
  return {
    format: "sql",
    sql: "SELECT 1 AS id",
    ...opts,
  };
}

type DataTestEqualsRowsExpectation = Extract<
  DataTestEqualsExpectation,
  { format: "rows" }
>;

export function createMockDataTestEqualsExpectation(
  opts?: Partial<DataTestEqualsRowsExpectation>,
): DataTestEqualsRowsExpectation {
  return {
    type: "equals",
    name: "output rows",
    ...createMockDataTestRowsData(),
    ...opts,
  };
}

export function createMockDataTestEmptyExpectation(
  opts?: Partial<DataTestEmptyExpectation>,
): DataTestEmptyExpectation {
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
        ...createMockDataTestRowsData(),
      },
    ],
    expectations: [createMockDataTestEqualsExpectation()],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    last_run: null,
    ...opts,
  };
}
