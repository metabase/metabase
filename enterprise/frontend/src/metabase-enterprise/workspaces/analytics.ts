import { trackSimpleEvent } from "metabase/analytics";
import type { WorkspaceId } from "metabase-types/api";

export function trackWorkspaceCreated({
  workspaceId,
}: {
  workspaceId: WorkspaceId;
}) {
  trackSimpleEvent({
    event: "workspaces_new_created",
    target_id: workspaceId,
  });
}
