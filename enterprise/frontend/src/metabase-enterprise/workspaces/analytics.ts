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

export function trackWorkspaceConfigDownloaded({
  workspaceId,
}: {
  workspaceId: WorkspaceId;
}) {
  trackSimpleEvent({
    event: "workspaces_config_downloaded",
    target_id: workspaceId,
  });
}

export function trackWorkspaceSetupButtonClicked() {
  trackSimpleEvent({
    event: "workspaces_setup_button_clicked",
  });
}

export function trackWorkspaceInstanceSetup() {
  trackSimpleEvent({
    event: "workspaces_instance_setup",
    triggered_from: "upload",
  });
}

export function trackWorkspaceInstanceLeave() {
  trackSimpleEvent({
    event: "workspaces_instance_leave",
  });
}
