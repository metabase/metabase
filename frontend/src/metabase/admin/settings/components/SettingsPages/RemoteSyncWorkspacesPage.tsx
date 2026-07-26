import { UpsellRemoteSync } from "metabase/admin/upsells";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { getPlan, isProPlan } from "metabase/common/utils/plan";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";

export function RemoteSyncWorkspacesPage() {
  const hasRemoteSync = useHasTokenFeature("remote_sync");
  const tokenFeatures = useSetting("token-features");
  const isPro = isProPlan(getPlan(tokenFeatures));

  if (hasRemoteSync || isPro) {
    return <PLUGIN_REMOTE_SYNC.Workspaces />;
  }

  return <UpsellRemoteSync source="settings-git-sync-workspaces" />;
}
