import { UpsellRemoteSync } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { getPlan, isProPlan } from "metabase/common/utils/plan";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSetting } from "metabase/settings";

export function RemoteSyncSettingsPage() {
  const hasRemoteSync = useHasTokenFeature("remote_sync");
  const tokenFeatures = useSetting("token-features");
  const isPro = isProPlan(getPlan(tokenFeatures));

  if (hasRemoteSync || isPro) {
    return <PLUGIN_REMOTE_SYNC.RemoteSyncSettings />;
  }

  return <UpsellRemoteSync source="settings-git-sync" />;
}
