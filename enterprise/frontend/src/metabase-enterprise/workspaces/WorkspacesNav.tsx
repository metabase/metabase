import { t } from "ttag";

import { SettingsNavItem } from "metabase/admin/settings/components/SettingsNav";

export const WorkspacesNav = () => {
  return (
    <SettingsNavItem path="workspaces" label={t`Workspaces`} icon="folder" />
  );
};
