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

export function trackDataActionExecuted(actionId: WritebackActionId) {
  trackSimpleEvent({
    event: "data_action_executed",
    target_id: actionId,
  });
}
