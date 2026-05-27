import { t } from "ttag";

import { SettingsNavItem } from "./SettingsNavItem";

export const DataAppsNav = () => {
  return (
    <SettingsNavItem path="data-apps" label={t`Data apps`} icon="dashboard" />
  );
};
