import type {
  CollectionPermissions,
  DatabaseId,
  GroupsPermissions,
  SettingDefinition,
} from "metabase-types/api";

export type AdminPathKey =
  | "data-model"
  | "settings"
  | "metabot"
  | "people"
  | "databases"
  | "permissions"
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
  };
  databases: {
    deletionError: null | unknown;
    deletes: DatabaseId[];
  };
}

export interface AdminAppState {
  paths: AdminPath[];
}
