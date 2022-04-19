import { t } from "ttag";

import { User } from "metabase-types/api";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_ADMIN_NAV_ITEMS, PLUGIN_ADMIN_TOOLS } from "metabase/plugins";

type PathKeys =
  | "data-model"
  | "settings"
  | "people"
  | "databases"
  | "permissions"
  | "troubleshooting"
  | "audit"
  | "tools";

export const NAV_PERMISSION_GUARD: {
  [key in PathKeys]?: (user: User) => boolean;
} = {};

const defaultGuard = (user?: User) => user?.is_superuser;

const canAccessMenuItem = (key: PathKeys, user: User) => {
  return defaultGuard(user) || NAV_PERMISSION_GUARD[key]?.(user);
};

type MenuItemDescriptor = {
  key: PathKeys;
  name: string;
  path: string;
};

type MenuItemsGetter = () => MenuItemDescriptor[];

const getAllMenuItems: MenuItemsGetter = () => {
  const items: MenuItemDescriptor[] = [
    {
      name: t`Settings`,
      path: "/admin/settings",
      key: "settings",
    },
    {
      name: t`Databases`,
      path: "/admin/databases",
      key: "databases",
    },
    {
      name: t`Data Model`,
      path: "/admin/datamodel",
      key: "data-model",
    },
    {
      name: t`People`,
      path: "/admin/people",
      key: "people",
    },
    {
      name: t`Permissions`,
      path: "/admin/permissions",
      key: "permissions",
    },
  ];

  const isModelPersistenceEnabled = MetabaseSettings.get(
    "enabled-persisted-models",
  );
  const hasLoadedSettings = typeof isModelPersistenceEnabled === "boolean";

  if (
    !hasLoadedSettings ||
    isModelPersistenceEnabled ||
    PLUGIN_ADMIN_TOOLS.EXTRA_ROUTES.length > 0
  ) {
    items.push({
      name: t`Tools`,
      path: "/admin/tools",
      key: "tools",
    });
  }

  items.push(...PLUGIN_ADMIN_NAV_ITEMS, {
    name: t`Troubleshooting`,
    path: "/admin/troubleshooting",
    key: "troubleshooting",
  });

  return items;
};

export const getAllowedMenuItems = (user: User) =>
  getAllMenuItems().filter(item => canAccessMenuItem(item.key, user));

export const canAccessAdmin = (user: User) =>
  getAllowedMenuItems(user).length > 0;

export const canAccessPath = (key: string, user: User) =>
  getAllowedMenuItems(user).some(item => item.key === key);
