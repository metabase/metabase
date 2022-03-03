import { GroupsPermissions } from "metabase-types/api";

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
