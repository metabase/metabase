import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackBranchSwitched = ({
  triggeredFrom,
}: {
  triggeredFrom: "admin-settings" | "app-bar";
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
  triggeredFrom: "admin-settings" | "app-bar";
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
  triggeredFrom: "app-bar" | "conflict-modal";
  force: boolean;
}) => {
  trackSimpleEvent({
    event: "remote_sync_push_changes",
    triggered_from: triggeredFrom,
    ...(force && { event_detail: "force" }),
  });
};

export const trackRemoteSyncSettingsChanged = ({
  triggeredFrom,
}: {
  triggeredFrom: "admin-settings" | "data-studio";
}) => {
  trackSimpleEvent({
    event: "remote_sync_settings_changed",
    triggered_from: triggeredFrom,
  });
};

export const trackRemoteSyncDeactivated = () => {
  trackSimpleEvent({
    event: "remote_sync_deactivated",
    triggered_from: "admin-settings",
  });
};
