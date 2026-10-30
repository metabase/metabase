import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { TransformId } from "./transform";
import type { UserId, UserInfo } from "./user";

export type TransformTestId = number;
export type TransformTestRunId = number;

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

export const TRANSFORM_TEST_RUN_STATUSES = [
  "started",
  "passed",
  "failed",
  "error",
  "timeout",
] as const;
export type TransformTestRunStatus =
  (typeof TRANSFORM_TEST_RUN_STATUSES)[number];

export type TransformTestRun = {
  id: TransformTestRunId;
  transform_test_id: TransformTestId | null;
  initiated_by: UserId | null;
  start_time: string;
  end_time: string | null;
  status: TransformTestRunStatus;
  last_heartbeat: string;
};

export type TransformTestRunUser = Pick<
  UserInfo,
  "id" | "email" | "first_name" | "last_name" | "common_name"
>;

export type TransformTestRunWithUser = TransformTestRun & {
  initiated_by_user: TransformTestRunUser | null;
};

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
  last_run: TransformTestRun | null;
};

export type ListTransformTestsRequest = {
  "transform-id"?: TransformId;
};

export type ListTransformTestRunsRequest = {
  id: TransformTestId;
  statuses?: TransformTestRunStatus[];
  "start-time"?: string;
  "end-time"?: string;
} & PaginationRequest;

export type ListTransformTestRunsResponse = {
  data: TransformTestRunWithUser[];
} & PaginationResponse;

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
