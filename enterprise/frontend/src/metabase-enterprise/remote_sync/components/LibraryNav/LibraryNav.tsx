import { t } from "ttag";

import { SettingsNavItem } from "metabase/admin/settings/components/SettingsNav";

export const LibraryNav = () => {
  return (
    <SettingsNavItem
      label={t`Remote sync`}
      icon="sync"
      folderPattern="remote-sync"
    >
      <SettingsNavItem path="remote-sync" label={t`Settings`} />
      <SettingsNavItem path="remote-sync/worktrees" label={t`Worktrees`} />
    </SettingsNavItem>
  );
};
