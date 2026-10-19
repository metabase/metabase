import { UpsellRemoteSync } from "metabase/admin/upsells";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";

export function RemoteSyncSettingsPage() {
  if (PLUGIN_REMOTE_SYNC.isEnabled) {
    return <PLUGIN_REMOTE_SYNC.RemoteSyncSettings />;
  }

  return <UpsellRemoteSync source="settings-git-sync" />;
}
