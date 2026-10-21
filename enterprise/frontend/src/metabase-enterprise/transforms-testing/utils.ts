import type {
  TransformRun,
  TransformRunStatus,
  TransformTestRun,
  TransformTestRunStatus,
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
