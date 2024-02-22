import type {
  CollectionPermissions,
  GroupsPermissions,
  SettingDefinition,
} from "metabase-types/api";

export type AdminPathKey =
  | "data-model"
  | "settings"
  | "people"
  | "databases"
  | "permissions"
  | "troubleshooting"
  | "audit"
  | "tools"
  | "caching";

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
    collectionPermissions: CollectionPermissions;
    originalCollectionPermissions: CollectionPermissions;
    saveError?: string;
    isHelpReferenceOpen: boolean;
    hasRevisionChanged: {
      revision: number | null;
      hasChanged: boolean;
    };
  };
  settings: {
    settings: SettingDefinition[];
  };
}

export interface AdminAppState {
  isNoticeEnabled: boolean;
  paths: AdminPath[];
}
