import { User } from "metabase-types/api";

export interface UserWithPermissions extends User {
  can_access_monitoring: boolean;
  can_access_settings: boolean;
  can_access_subscription: boolean;
}
