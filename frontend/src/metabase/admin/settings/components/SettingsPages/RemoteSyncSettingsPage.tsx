import { UpsellRemoteSync } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";

export function RemoteSyncSettingsPage() {
  const hasRemoteSync = useHasTokenFeature("remote_sync");

  if (hasRemoteSync) {
    return <PLUGIN_REMOTE_SYNC.RemoteSyncSettings />;
  }

  return <UpsellRemoteSync source="settings-git-sync" />;
}
