import { t } from "ttag";

import { SettingsNavItem } from "metabase/admin/settings/components/SettingsNav";

export const WorkspacesNav = () => {
  return (
    <SettingsNavItem
      label={t`Workspaces`}
      icon="folder"
      folderPattern="workspaces"
    >
      <SettingsNavItem path="workspaces/mode" label={t`Mode`} />
      <SettingsNavItem path="workspaces/provisioning" label={t`Provisioning`} />
    </SettingsNavItem>
  );
};
