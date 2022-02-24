import { GroupsPermissions } from "metabase-types/types/Permissions";

export interface AdminState {
  app: AdminAppState;
  permissions: {
    dataPermissions: GroupsPermissions;
    originalDataPermissions: GroupsPermissions;
  };
}

export interface AdminAppState {
  isNoticeEnabled: boolean;
}
