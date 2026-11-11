import type { DataTestRun } from "./data-test-run";
import type { TransformId } from "./transform";
import type { UserId } from "./user";

export type TransformTestId = number;

export type TransformTestTable = {
  schema?: string | null;
  name: string;
};

export type TransformTestColumn = {
  name: string;
  cast_type: string;
};

export type TransformTestRowValue = string | number | boolean | null;
export type TransformTestRow = Record<string, TransformTestRowValue>;

export type TransformTestRowsData = {
  format: "rows";
  columns: TransformTestColumn[];
  rows: TransformTestRow[];
};

export type TransformTestSqlData = {
  format: "sql";
  sql: string;
};

export type TransformTestData = TransformTestRowsData | TransformTestSqlData;

export type TransformTestInput = {
  table: TransformTestTable;
} & TransformTestData;

export type TransformTestEqualsExpectation = {
  type: "equals";
  name: string;
} & TransformTestData;

export type TransformTestEmptyExpectation = {
  type: "empty";
  name: string;
  sql: string;
};

export type TransformTestExpectation =
  | TransformTestEqualsExpectation
  | TransformTestEmptyExpectation;

export type TransformTest = {
  id: TransformTestId;
  entity_id: string;
  transform_id: TransformId;
  creator_id: UserId;
  name: string;
  description: string | null;
  inputs: TransformTestInput[];
  expectations: TransformTestExpectation[];
  created_at: string;
  updated_at: string;
  last_run: DataTestRun | null;
};

export type ListTransformTestsRequest = {
  "transform-id"?: TransformId;
};

export type TransformTestResultStatus = "passed" | "failed" | "error";

export type TransformTestExpectationResult = {
  name: string;
  type: TransformTestExpectation["type"];
  status: TransformTestResultStatus;
  error?: { type: string; message: string };
};

export type RunTransformTestResponse = {
  status: TransformTestResultStatus;
  expectations: TransformTestExpectationResult[];
  tables: Record<string, string>;
};
