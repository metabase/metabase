import { t } from "ttag";

import type {
  DataTestId,
  DataTestRun,
  DataTestRunStatus,
  DataTestType,
  TransformRun,
  TransformRunStatus,
  TransformTestTable,
} from "metabase-types/api";

const TRANSFORM_RUN_STATUSES: Record<DataTestRunStatus, TransformRunStatus> = {
  started: "started",
  passed: "succeeded",
  failed: "failed",
  error: "failed",
  timeout: "timeout",
};

export function getTransformRunStatus(
  status: DataTestRunStatus,
): TransformRunStatus {
  return TRANSFORM_RUN_STATUSES[status];
}

export function getRunStatusInfo(
  run: DataTestRun | null,
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

export function formatDataTestRunStatus(status: DataTestRunStatus) {
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

export function isFailedDataTestRunStatus(status: DataTestRunStatus) {
  return status === "failed" || status === "error" || status === "timeout";
}

export function getRunDataTestCacheKey(
  testType: DataTestType,
  testId: DataTestId,
) {
  return `run-${testType}-test-${testId}`;
}
