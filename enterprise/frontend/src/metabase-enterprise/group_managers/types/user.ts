import type { User } from "metabase-types/api";

export interface UserWithGroupManagerPermission extends User {
  permissions?: {
    is_group_manager: boolean;
  };
}
