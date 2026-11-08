import { UpsellRemoteSync } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { getPlan, isProPlan, useSetting } from "metabase/settings";

export function RemoteSyncSettingsPage() {
  const hasRemoteSync = useHasTokenFeature("remote_sync");
  const tokenFeatures = useSetting("token-features");
  const isPro = isProPlan(getPlan(tokenFeatures));

  if (hasRemoteSync || isPro) {
    return null;
  }

  return <UpsellRemoteSync source="settings-git-sync" />;
}
