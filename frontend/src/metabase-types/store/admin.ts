import type {
  CollectionPermissions,
  DatabaseId,
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
  | "performance"
  | "performance-models"
  | "performance-dashboards-and-questions"
  | "performance-databases";

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
  databases: {
    deletionError: null | unknown;
    deletes: DatabaseId[];
  };
}

export interface AdminAppState {
  isNoticeEnabled: boolean;
  paths: AdminPath[];
}
