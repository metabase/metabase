import type { User } from "metabase-types/api";

export interface UserWithApplicationPermissions extends User {
  permissions?: {
    can_access_monitoring: boolean;
    can_access_setting: boolean;
    can_access_subscription: boolean;
  };
}
