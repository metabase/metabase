import { trackSimpleEvent } from "metabase/analytics";
import type {
  InspectorCardId,
  InspectorLensId,
  TransformId,
  TransformJobId,
} from "metabase-types/api";

/** Lens ID concatenated with params */
type LensKey = string;

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
  isIncremental,
}: {
  transformId: TransformId;
  isIncremental: boolean;
}) {
  trackSimpleEvent({
    event: "transform_created",
    target_id: transformId,
    event_detail: isIncremental ? "incremental" : undefined,
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

export function trackTransformJobCreated({
  result,
  jobId,
}: {
  result: "success" | "failure";
  jobId?: TransformJobId;
}) {
  trackSimpleEvent({
    event: "transform_job_created",
    triggered_from: "transform_job_new",
    result,
    target_id: jobId ?? null,
  });
}

export function trackTransformInspectLensLoaded({
  transformId,
  lensKey,
  durationMs,
}: {
  transformId: TransformId;
  lensKey: LensKey;
  durationMs: number;
}) {
  trackSimpleEvent({
    event: "transform_inspect_lens_loaded",
    target_id: transformId,
    event_detail: lensKey,
    duration_ms: durationMs,
  });
}

export function trackTransformInspectDrillLensClicked({
  transformId,
  lensId,
  triggeredFrom,
}: {
  transformId: TransformId;
  lensId: InspectorLensId;
  triggeredFrom: "card_drills" | "join_analysis";
}) {
  trackSimpleEvent({
    event: "transform_inspect_drill_lens_clicked",
    target_id: transformId,
    event_detail: lensId,
    triggered_from: triggeredFrom,
  });
}

export function trackTransformInspectAlertClicked({
  transformId,
  cardId,
}: {
  transformId: TransformId;
  cardId: InspectorCardId;
}) {
  trackSimpleEvent({
    event: "transform_inspect_alert_clicked",
    target_id: transformId,
    event_detail: cardId,
  });
}

export function trackTransformInspectDrillLensClosed({
  transformId,
  lensId,
}: {
  transformId: TransformId;
  lensId: InspectorLensId;
}) {
  trackSimpleEvent({
    event: "transform_inspect_drill_lens_closed",
    target_id: transformId,
    event_detail: lensId,
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
