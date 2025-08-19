import { trackSimpleEvent } from "metabase/lib/analytics";
import type { TransformId, TransformJobId } from "metabase-types/api";

export function trackTranformTriggerManualRun({
  transformId,
  triggeredFrom,
}: {
  transformId: TransformId;
  triggeredFrom: "transform-page";
}) {
  trackSimpleEvent({
    event: "transform_trigger_manual_run",
    target_id: transformId,
    triggered_from: triggeredFrom,
  });
}

export function trackTranformJobTriggerManualRun({
  jobId,
  triggeredFrom,
}: {
  jobId: TransformJobId;
  triggeredFrom: "job-page";
}) {
  trackSimpleEvent({
    event: "transform_job_trigger_manual_run",
    target_id: jobId,
    triggered_from: triggeredFrom,
  });
}
