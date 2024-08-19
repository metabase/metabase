import type {
  CollectionPermissions,
  GroupsPermissions,
  SettingDefinition,
  SettingKey,
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
  | "performance";

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
    warnings: Partial<Record<SettingKey, unknown>>;
  };
}

export interface AdminAppState {
  isNoticeEnabled: boolean;
  paths: AdminPath[];
}
