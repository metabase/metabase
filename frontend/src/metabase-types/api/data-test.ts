import type { Card, CardId } from "./card";
import type { DataTestRun } from "./data-test-run";
import type { Transform, TransformId } from "./transform";
import type { UserId } from "./user";

export type DataTestTable = {
  schema?: string | null;
  name: string;
};

export type DataTestColumn = {
  name: string;
  cast_type: string;
};

export type DataTestRowValue = string | number | boolean | null;
export type DataTestRow = Record<string, DataTestRowValue>;

export type DataTestRowsData = {
  format: "rows";
  columns: DataTestColumn[];
  rows: DataTestRow[];
};

export type DataTestSqlData = {
  format: "sql";
  sql: string;
};

export type DataTestData = DataTestRowsData | DataTestSqlData;

export type DataTestInput = {
  table: DataTestTable;
} & DataTestData;

export type DataTestEqualsExpectation = {
  type: "equals";
  name: string;
} & DataTestData;

export type DataTestEmptyExpectation = {
  type: "empty";
  name: string;
  sql: string;
};

export type DataTestExpectation =
  | DataTestEqualsExpectation
  | DataTestEmptyExpectation;

export type TransformTestId = number;

export type TransformTest = {
  id: TransformTestId;
  entity_id: string;
  transform_id: TransformId;
  creator_id: UserId;
  name: string;
  description: string | null;
  inputs: DataTestInput[];
  expectations: DataTestExpectation[];
  created_at: string;
  updated_at: string;
  last_run: DataTestRun | null;
  transform?: Transform;
};

export type ListTransformTestsRequest = {
  "transform-id"?: TransformId;
};

export type TransformTestResultStatus = "passed" | "failed" | "error";

export type TransformTestExpectationResult = {
  name: string;
  type: DataTestExpectation["type"];
  status: TransformTestResultStatus;
  error?: { type: string; message: string };
};

export type RunTransformTestResponse = {
  status: TransformTestResultStatus;
  expectations: TransformTestExpectationResult[];
  tables: Record<string, string>;
};

export type CardTestId = number;

export type CardTest = {
  id: CardTestId;
  entity_id: string;
  card_id: CardId;
  creator_id: UserId;
  name: string;
  description: string | null;
  inputs: DataTestInput[];
  expectations: DataTestExpectation[];
  created_at: string;
  updated_at: string;
  card?: Card;
};
