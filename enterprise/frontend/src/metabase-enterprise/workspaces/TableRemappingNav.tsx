import { t } from "ttag";

import { SettingsNavItem } from "metabase/admin/settings/components/SettingsNav";
import { useSetting } from "metabase/common/hooks";

export const TableRemappingNav = () => {
  const hasRemappingsEnabled = useSetting("has-remappings-enabled");

  if (!hasRemappingsEnabled) {
    return null;
  }

  return (
    <SettingsNavItem
      path="table-remapping"
      label={t`Table remapping`}
      icon="table2"
    />
  );
};
