import { parseTimestamp } from "metabase/lib/time-dayjs";
import type { Transform } from "metabase-types/api";

export function isTransformRunning(transform: Transform) {
  const lastRun = transform.last_run;
  return lastRun?.status === "started";
}

export function isTransformSyncing(transform: Transform) {
  const lastRun = transform.last_run;

  // If the last run succeeded but there is no table yet, wait for the sync to
  // finish. If the transform is changed until the sync finishes, stop polling,
  // because the table could be already deleted.
  if (
    transform.table == null &&
    lastRun?.status === "succeeded" &&
    lastRun?.end_time != null
  ) {
    const endedAt = parseTimestamp(lastRun.end_time);
    const updatedAt = parseTimestamp(transform.updated_at);
    return endedAt.isAfter(updatedAt);
  }

  return false;
}
