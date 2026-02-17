import cx from "classnames";
import { t } from "ttag";

import { Radio } from "metabase/common/components/Radio";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_APPLICATION_PERMISSIONS,
} from "metabase/plugins";

import type { PermissionsPageTab } from "./PermissionsPageLayout";

interface PermissionsTabsProps {
  tab: PermissionsPageTab;
  onChangeTab: (tab: PermissionsPageTab) => void;
}

export const PermissionsTabs = ({ tab, onChangeTab }: PermissionsTabsProps) => {
  const isUsingTenants = useSetting("use-tenants");

  const adminPermissionsTabs = isUsingTenants
    ? PLUGIN_ADMIN_PERMISSIONS_TABS.tabs
    : PLUGIN_ADMIN_PERMISSIONS_TABS.tabs.filter(
        (tab) =>
          tab.value !== "tenant-collections" &&
          tab.value !== "tenant-specific-collections",
      );

  return (
    <div className={cx(CS.px3, CS.mt1)}>
      <Radio
        colorScheme="accent7"
        value={tab}
        options={[
          { name: t`Data`, value: "data" },
          { name: t`Collections`, value: "collections" },
          ...adminPermissionsTabs,
          ...PLUGIN_APPLICATION_PERMISSIONS.tabs,
        ]}
        onOptionClick={onChangeTab}
        variant="underlined"
      />
    </div>
  );
};
