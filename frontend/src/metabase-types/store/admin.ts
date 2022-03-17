import { GeneralPermissions, GroupsPermissions } from "metabase-types/api";

export interface AdminState {
  app: AdminAppState;
  permissions: {
    dataPermissions: GroupsPermissions;
    originalDataPermissions: GroupsPermissions;
    generalPermissions: GeneralPermissions;
    originalGeneralPermissions: GeneralPermissions;
  };
}

export interface AdminAppState {
  isNoticeEnabled: boolean;
}
