import { t } from "ttag";

import { SettingsNavItem as AdminSettingsNavItem } from "metabase/admin/settings/components/SettingsNav";

export const SettingsNavItem = () => (
  <AdminSettingsNavItem path="remote-sync" label={t`Remote sync`} icon="sync" />
);
