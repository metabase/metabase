import { t } from "ttag";

import { SettingsNavItem } from "metabase/admin/settings/components/SettingsNav";

export const DataAppsNav = () => {
  return (
    <SettingsNavItem path="data-apps" label={t`Data apps`} icon="dashboard" />
  );
};
