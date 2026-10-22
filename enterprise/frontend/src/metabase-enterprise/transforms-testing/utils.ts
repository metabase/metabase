import { t } from "ttag";

import type {
  TransformRun,
  TransformRunStatus,
  TransformTestId,
  TransformTestRun,
  TransformTestRunStatus,
  TransformTestTable,
} from "metabase-types/api";

const TRANSFORM_RUN_STATUSES: Record<
  TransformTestRunStatus,
  TransformRunStatus
> = {
  started: "started",
  passed: "succeeded",
  failed: "failed",
  error: "failed",
  timeout: "timeout",
};

export function getTransformRunStatus(
  status: TransformTestRunStatus,
): TransformRunStatus {
  return TRANSFORM_RUN_STATUSES[status];
}

export function getRunStatusInfo(
  run: TransformTestRun | null,
): Pick<TransformRun, "status" | "end_time" | "message"> | null {
  if (run == null) {
    return null;
  }
  return {
    status: getTransformRunStatus(run.status),
    end_time: run.end_time,
    message: null,
  };
}

export function getTableName(table: TransformTestTable) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

export function formatTestRunStatus(status: TransformTestRunStatus) {
  switch (status) {
    case "started":
      return t`In progress`;
    case "passed":
      return t`Passed`;
    case "failed":
      return t`Failed`;
    case "error":
      return t`Error`;
    case "timeout":
      return t`Timeout`;
  }
}

export function isFailedTestRunStatus(status: TransformTestRunStatus) {
  return status === "failed" || status === "error" || status === "timeout";
}

export function getRunTransformTestCacheKey(testId: TransformTestId) {
  return `run-transform-test-${testId}`;
}
