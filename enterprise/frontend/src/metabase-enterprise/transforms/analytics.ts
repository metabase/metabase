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

export function trackTransformCreate({
  triggeredFrom,
  creationType,
}: {
  triggeredFrom: "transform-page-create-menu";
  creationType: "query" | "native" | "python" | "saved-question";
}) {
  trackSimpleEvent({
    event: "transform_create",
    triggered_from: triggeredFrom,
    event_detail: creationType,
  });
}

export function trackTransformCreated({
  transformId,
}: {
  transformId: TransformId;
}) {
  trackSimpleEvent({
    event: "transform_created",
    target_id: transformId,
  });
}
