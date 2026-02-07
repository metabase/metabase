import type {
  CollectionPermissions,
  DatabaseId,
  GroupsPermissions,
} from "metabase-types/api";

export type AdminPathKey =
  | "data-model"
  | "settings"
  | "embedding"
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
  datamodel: {
    previewSummary: any;
    revisions: any[];
  };
  people: {
    temporaryPasswords: Record<number, string | null>;
    memberships?: any[];
  };
  permissions: {
    dataPermissions: GroupsPermissions;
    originalDataPermissions: GroupsPermissions;
    dataPermissionsRevision: number | null;
    collectionPermissions: CollectionPermissions;
    originalCollectionPermissions: CollectionPermissions;
    collectionPermissionsRevision: number | null;
    tenantCollectionPermissions: CollectionPermissions;
    originalTenantCollectionPermissions: CollectionPermissions;
    tenantCollectionPermissionsRevision: number | null;
    tenantSpecificCollectionPermissions: CollectionPermissions;
    originalTenantSpecificCollectionPermissions: CollectionPermissions;
    tenantSpecificCollectionPermissionsRevision: number | null;
    saveError?: string;
    isHelpReferenceOpen: boolean;
    hasRevisionChanged: {
      revision: number | null;
      hasChanged: boolean;
    };
  };
  databases: {
    deletionError: null | unknown;
    deletes: DatabaseId[];
  };
}

export interface AdminAppState {
  paths: AdminPath[];
}
