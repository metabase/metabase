import { GroupId } from "metabase-types/api";

export type GeneralPermissionKey = "subscription";
export type GeneralPermissionValue = "yes" | "no";

export type GroupGeneralPermissions = {
  [key in GeneralPermissionKey]: GeneralPermissionValue;
};

export type GeneralPermissions = {
  [key: GroupId]: GroupGeneralPermissions;
};
