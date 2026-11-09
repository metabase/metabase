import type { PaginationRequest, PaginationResponse } from "./pagination";
import type { TransformTestId } from "./transform-test";
import type { UserId, UserInfo } from "./user";

export type DataTestRunId = number;

export const DATA_TEST_RUN_STATUSES = [
  "started",
  "passed",
  "failed",
  "error",
  "timeout",
] as const;
export type DataTestRunStatus = (typeof DATA_TEST_RUN_STATUSES)[number];

export type DataTestRun = {
  id: DataTestRunId;
  test_type: "transform";
  test_id: TransformTestId | null;
  initiated_by: UserId | null;
  start_time: string;
  end_time: string | null;
  status: DataTestRunStatus;
  last_heartbeat: string;
};

export type DataTestRunUser = Pick<
  UserInfo,
  "id" | "email" | "first_name" | "last_name" | "common_name"
>;

export type DataTestRunWithUser = DataTestRun & {
  initiated_by_user: DataTestRunUser | null;
};

export type ListDataTestRunsRequest = {
  id: TransformTestId;
  statuses?: DataTestRunStatus[];
  "start-time"?: string;
  "end-time"?: string;
} & PaginationRequest;

export type ListDataTestRunsResponse = {
  data: DataTestRunWithUser[];
} & PaginationResponse;
