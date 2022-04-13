import { User } from "metabase-types/api";

export interface UserWithGeneralPermissions extends User {
  permissions?: {
    can_access_monitoring: boolean;
    can_access_setting: boolean;
    can_access_subscription: boolean;
  };
}
