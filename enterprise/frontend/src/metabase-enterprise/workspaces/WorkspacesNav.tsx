import { t } from "ttag";

import { SettingsNavItem } from "metabase/admin/settings/components/SettingsNav";

export const WorkspacesNav = () => {
  return (
    <SettingsNavItem
      label={t`Workspaces`}
      icon="folder"
      folderPattern="workspaces"
    >
      <SettingsNavItem path="workspaces" label={t`Provisioning`} />
      <SettingsNavItem
        path="workspaces/table-remappings"
        label={t`Table remappings`}
      />
    </SettingsNavItem>
  );
};
