import { t } from "ttag";

import { SettingsNavItem } from "metabase/admin/settings/components/SettingsNav";

export const LibraryNav = () => {
  return (
    <SettingsNavItem
      path="remote-sync"
      label={t`Git integration`}
      icon="git_branch"
    />
  );
};
