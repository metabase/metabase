import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackBranchSwitched = ({
  triggeredFrom,
}: {
  triggeredFrom: "sidebar" | "admin-settings" | "app-bar";
}) => {
  trackSimpleEvent({
    event: "remote_sync_branch_switched",
    triggered_from: triggeredFrom,
  });
};

export const trackBranchCreated = ({
  triggeredFrom,
}: {
  triggeredFrom: "branch-picker" | "conflict-modal";
}) => {
  trackSimpleEvent({
    event: "remote_sync_branch_created",
    triggered_from: triggeredFrom,
  });
};

export const trackPullChanges = ({
  triggeredFrom,
  force,
}: {
  triggeredFrom: "sidebar" | "admin-settings" | "app-bar";
  force: boolean;
}) => {
  trackSimpleEvent({
    event: "remote_sync_pull_changes",
    triggered_from: triggeredFrom,
    ...(force && { event_detail: "force" }),
  });
};

export const trackPushChanges = ({
  triggeredFrom,
  force,
}: {
  triggeredFrom: "sidebar" | "conflict-modal";
  force: boolean;
}) => {
  trackSimpleEvent({
    event: "remote_sync_push_changes",
    triggered_from: triggeredFrom,
    ...(force && { event_detail: "force" }),
  });
};

export const trackRemoteSyncSettingsChanged = () => {
  trackSimpleEvent({
    event: "remote_sync_settings_changed",
    triggered_from: "admin-settings",
  });
};

export const trackRemoteSyncDeactivated = () => {
  trackSimpleEvent({
    event: "remote_sync_deactivated",
    triggered_from: "admin-settings",
  });
};
