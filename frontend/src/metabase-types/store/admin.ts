import { GroupsPermissions } from "metabase-types/api";

export type AdminPathKey =
  | "data-model"
  | "settings"
  | "people"
  | "databases"
  | "permissions"
  | "troubleshooting"
  | "audit"
  | "tools";

export type AdminPath = {
  key: AdminPathKey;
  name: string;
  path: string;
};

export interface AdminState {
  app: AdminAppState;
  permissions: {
    dataPermissions: GroupsPermissions;
    originalDataPermissions: GroupsPermissions;
  };
}

export interface AdminAppState {
  isNoticeEnabled: boolean;
  paths: AdminPath[];
}
