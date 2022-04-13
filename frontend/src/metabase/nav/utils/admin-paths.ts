import { User } from "metabase-types/api";
import { PLUGIN_ADMIN_NAV_ITEMS } from "metabase/plugins";
import { t } from "ttag";

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

const getAllMenuItems: () => {
  key: PathKeys;
  name: string;
  path: string;
}[] = () => [
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
  ...PLUGIN_ADMIN_NAV_ITEMS,
  {
    name: t`Troubleshooting`,
    path: "/admin/troubleshooting",
    key: "troubleshooting",
  },
];

export const getAllowedMenuItems = (user: User) =>
  getAllMenuItems().filter(item => canAccessMenuItem(item.key, user));

export const canAccessAdmin = (user: User) =>
  getAllowedMenuItems(user).length > 0;

export const canAccessPath = (key: string, user: User) =>
  getAllowedMenuItems(user).some(item => item.key === key);
