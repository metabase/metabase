import { t } from "ttag";

import {
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_APPLICATION_PERMISSIONS,
} from "metabase/plugins";
import { useSetting } from "metabase/settings";
import { Box, Tabs } from "metabase/ui";

import type { PermissionsPageTab } from "./PermissionsPageLayout";

interface PermissionsTabsProps {
  tab: PermissionsPageTab;
  onChangeTab: (tab: PermissionsPageTab) => void;
}

/** The permission editor sections, shared by the hub's tabs and the admin nav. */
export function usePermissionsTabs(): { name: string; value: string }[] {
  const isUsingTenants = useSetting("use-tenants");

  const adminPermissionsTabs = isUsingTenants
    ? PLUGIN_ADMIN_PERMISSIONS_TABS.tabs
    : PLUGIN_ADMIN_PERMISSIONS_TABS.tabs.filter(
        (tab) =>
          tab.value !== "tenant-collections" &&
          tab.value !== "tenant-specific-collections",
      );

  return [
    { name: t`Data`, value: "data" },
    { name: t`Collections`, value: "collections" },
    ...adminPermissionsTabs,
    ...PLUGIN_APPLICATION_PERMISSIONS.tabs,
  ];
}

export const PermissionsTabs = ({ tab, onChangeTab }: PermissionsTabsProps) => {
  const tabs = usePermissionsTabs();

  return (
    <Box mt="sm">
      <Tabs
        listBorder={false}
        value={tab}
        onChange={(value) => value && onChangeTab(value)}
      >
        <Tabs.List pl="xxl">
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
