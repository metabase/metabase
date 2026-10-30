import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { ADMIN_PERMISSIONS_BASE_PATH } from "metabase/common/components/PermissionsBasePath/base-path";
import { PLUGIN_AI_CONTROLS } from "metabase/plugins";
import { useLocation } from "metabase/router";
import { Divider } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { ROLE_IDS, getRole } from "../../pages/RolePage/roles";
import { usePermissionsTabs } from "../PermissionsPageLayout/PermissionsTabs";

const TAB_ICONS: Record<string, IconName> = {
  collections: "folder",
  "tenant-collections": "globe",
  "tenant-specific-collections": "group",
  application: "gear",
};

const NavDivider = () => <Divider my="sm" />;

export function PermissionsNav() {
  const { pathname } = useLocation();
  const tabs = usePermissionsTabs().filter((tab) => tab.value !== "data");
  const dataPath = `${ADMIN_PERMISSIONS_BASE_PATH}/data`;
  const isWithin = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);

  const renderTab = (tab: { name: string; value: string }) => {
    const path = `${ADMIN_PERMISSIONS_BASE_PATH}/${tab.value}`;
    return (
      <AdminNavItem
        key={tab.value}
        label={tab.name}
        icon={TAB_ICONS[tab.value] ?? "lock"}
        path={path}
        // The editors drill down into sub-paths (`data/group/1`,
        // `collections/5`), so match on the section prefix.
        active={isWithin(path)}
      />
    );
  };

  const applicationTabs = tabs.filter((tab) => tab.value === "application");
  const collectionTabs = tabs.filter((tab) => tab.value !== "application");

  return (
    <AdminNavWrapper>
      <AdminNavItem
        label={t`Data access`}
        icon="database"
        // `/admin/permissions` redirects here, so start open on the bare path too.
        defaultOpened={
          isWithin(dataPath) || pathname === ADMIN_PERMISSIONS_BASE_PATH
        }
      >
        <AdminNavItem
          label={t`By database`}
          path={`${dataPath}/database`}
          active={isWithin(`${dataPath}/database`)}
        />
        <AdminNavItem
          label={t`By group`}
          path={`${dataPath}/group`}
          active={isWithin(`${dataPath}/group`)}
        />
      </AdminNavItem>
      <AdminNavItem
        label={t`Data isolation`}
        icon="shield"
        path={`${ADMIN_PERMISSIONS_BASE_PATH}/data-isolation`}
      />
      {collectionTabs.map(renderTab)}
      <NavDivider />
      {applicationTabs.map(renderTab)}
      {PLUGIN_AI_CONTROLS.getPermissionsNavItems()}
      <NavDivider />
      <AdminNavItem
        label={t`Roles`}
        icon="person"
        folderPattern={`${ADMIN_PERMISSIONS_BASE_PATH}/roles`}
      >
        {ROLE_IDS.map((roleId) => (
          <AdminNavItem
            key={roleId}
            label={getRole(roleId).name}
            path={`${ADMIN_PERMISSIONS_BASE_PATH}/roles/${roleId}`}
          />
        ))}
      </AdminNavItem>
    </AdminNavWrapper>
  );
}
