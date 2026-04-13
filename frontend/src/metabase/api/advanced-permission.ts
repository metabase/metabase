export type AdvancedPermissionValue = "yes" | "no";

export type AdvancedPermissionsGraphRevision = number;

export type AdvancedPermissions = {
  monitoring?: AdvancedPermissionValue;
  setting?: AdvancedPermissionValue;
  subscription?: AdvancedPermissionValue;
};

export type AdvancedPermissionsGroups = Record<
  AdvancedPermissionsGraphRevision,
  AdvancedPermissions
>;

export type AdvancedPermissionsGraph = {
  groups: AdvancedPermissionsGroups;
  revision: AdvancedPermissionsGraphRevision;
};
