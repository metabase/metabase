import { t } from "ttag";

import { SettingsNavItem } from "metabase/admin/settings/components/SettingsNav";

export const RemoteSyncNav = () => {
  return (
    <>
      <SettingsNavItem path="remote-sync" label={t`Remote sync`} icon="sync" />
      <SettingsNavItem
        path="remote-sync/workspaces"
        label={t`Workspaces`}
        icon="workspace"
      />
    </>
  );
};
