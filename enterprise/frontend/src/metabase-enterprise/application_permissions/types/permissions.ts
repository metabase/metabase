import type { GroupId } from "metabase-types/api";

export type ApplicationPermissionKey =
  | "subscription"
  | "monitoring"
  | "setting"
  | "remote-sync";
export type ApplicationPermissionValue = "yes" | "no";

export type GroupApplicationPermissions = {
  [key in ApplicationPermissionKey]: ApplicationPermissionValue;
};

export type ApplicationPermissions = {
  [key: GroupId]: GroupApplicationPermissions;
};
