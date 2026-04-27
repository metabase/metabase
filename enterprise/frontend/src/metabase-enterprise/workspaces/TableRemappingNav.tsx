import { t } from "ttag";

import { SettingsNavItem } from "metabase/admin/settings/components/SettingsNav";

export const TableRemappingNav = () => {
  return (
    <SettingsNavItem
      path="table-remapping"
      label={t`Table remapping`}
      icon="table2"
    />
  );
};
