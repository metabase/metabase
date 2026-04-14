import type { GroupId } from "./group";

export type AdvancedPermissionValue = "yes" | "no";

export type AdvancedPermissionsGraphRevision = number;

export type AdvancedPermissions = {
  monitoring?: AdvancedPermissionValue;
  setting?: AdvancedPermissionValue;
  subscription?: AdvancedPermissionValue;
};

export type AdvancedPermissionsGroups = Record<GroupId, AdvancedPermissions>;

export type AdvancedPermissionsGraph = {
  groups: AdvancedPermissionsGroups;
  revision: AdvancedPermissionsGraphRevision;
};
