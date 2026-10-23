import { trackSimpleEvent } from "metabase/analytics";
import type { WritebackActionId } from "metabase-types/api";

export function trackDataActionCreated(actionId: WritebackActionId) {
  trackSimpleEvent({
    event: "data_action_created",
    target_id: actionId,
  });
}

export function trackDataActionQueryUpdated(actionId: WritebackActionId) {
  trackSimpleEvent({
    event: "data_action_query_updated",
    target_id: actionId,
  });
}

export function trackDataActionArchived(actionId: WritebackActionId) {
  trackSimpleEvent({
    event: "data_action_archived",
    target_id: actionId,
  });
}

export type DataActionExecutedTriggeredFrom = "data_studio";

export function trackDataActionExecuted({
  actionId,
  triggeredFrom,
}: {
  actionId: WritebackActionId;
  triggeredFrom: DataActionExecutedTriggeredFrom;
}) {
  trackSimpleEvent({
    event: "data_action_executed",
    target_id: actionId,
    triggered_from: triggeredFrom,
  });
}
