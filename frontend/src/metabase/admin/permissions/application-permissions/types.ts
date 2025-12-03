import type { UserWithApplicationPermissions } from "metabase/plugins";
import type { GroupId } from "metabase-types/api";
import type { State } from "metabase-types/store";

export type ApplicationPermissionKey =
  | "subscription"
  | "monitoring"
  | "setting"
  | "data-studio";

export type ApplicationPermissionValue = "yes" | "no";

export type GroupApplicationPermissions = {
  [key in ApplicationPermissionKey]?: ApplicationPermissionValue;
};

export type ApplicationPermissions = {
  [key: GroupId]: GroupApplicationPermissions;
};

export interface ApplicationPermissionsState extends State {
  currentUser: UserWithApplicationPermissions | null;
  plugins: {
    applicationPermissionsPlugin?: {
      applicationPermissions: ApplicationPermissions;
      originalApplicationPermissions: ApplicationPermissions;
      applicationPermissionsRevision: number;
    };
  };
}
