import { trackSimpleEvent } from "metabase/analytics";
import type { DataAppId } from "metabase-types/api";

export function trackDataAppMadeLive(appId: DataAppId) {
  trackSimpleEvent({
    event: "data_app_made_live",
    target_id: appId,
  });
}

export function trackDataAppMadeDraft(appId: DataAppId) {
  trackSimpleEvent({
    event: "data_app_made_draft",
    target_id: appId,
  });
}

export function trackDataAppGroupAdded(appId: DataAppId) {
  trackSimpleEvent({
    event: "data_app_group_added",
    target_id: appId,
  });
}

export function trackDataAppGroupRemoved(appId: DataAppId) {
  trackSimpleEvent({
    event: "data_app_group_removed",
    target_id: appId,
  });
}
