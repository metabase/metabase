import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_APPLICATION_PERMISSIONS,
} from "metabase/plugins";
import { Box, Tabs } from "metabase/ui";

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

  const tabs = [
    { name: t`Data`, value: "data" },
    { name: t`Collections`, value: "collections" },
    ...adminPermissionsTabs,
    ...PLUGIN_APPLICATION_PERMISSIONS.tabs,
  ];

  return (
    <Box mt="sm">
      <Tabs
        listBorder={false}
        value={tab}
        onChange={(value) => value && onChangeTab(value as PermissionsPageTab)}
      >
        <Tabs.List pl="xl">
          {tabs.map((tabOption) => (
            <Tabs.Tab key={tabOption.value} value={tabOption.value}>
              {tabOption.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
    </Box>
  );
};
