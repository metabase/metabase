import { trackSimpleEvent } from "metabase/lib/analytics";
import type { TransformId, TransformJobId } from "metabase-types/api";

export function trackTransformTriggerManualRun({
  transformId,
}: {
  transformId: TransformId;
}) {
  trackSimpleEvent({
    event: "transform_trigger_manual_run",
    target_id: transformId,
  });
}

export function trackTransformJobTriggerManualRun({
  jobId,
}: {
  jobId: TransformJobId;
}) {
  trackSimpleEvent({
    event: "transform_job_trigger_manual_run",
    target_id: jobId,
  });
}

export function trackTransformCreate({
  creationType,
}: {
  creationType: "query" | "native" | "python" | "saved-question";
}) {
  trackSimpleEvent({
    event: "transform_create",
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

export function trackTransformRunTagsUpdated({
  added,
  transformId,
  result,
}: {
  added: boolean;
  transformId: number;
  result: "success" | "failure";
}) {
  trackSimpleEvent({
    event: "transform_tags_updated",
    triggered_from: "transform_run_page",
    event_detail: added ? "tag_added" : "tag_removed",
    target_id: transformId,
    result,
  });
}

export function trackDependencyDiagnosticsEntitySelected({
  triggeredFrom,
  entityId,
  entityType,
}: {
  entityId: number;
  entityType: string;
  triggeredFrom: "broken" | "unreferenced";
}) {
  trackSimpleEvent({
    event: "dependency_diagnostics_entity_selected",
    triggered_from: triggeredFrom,
    target_id: entityId,
    event_detail: entityType,
  });
}
