import type {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import type {
  DatabaseId,
  TableId,
  SchemaName,
  CollectionId,
} from "metabase-types/api";

import type { GroupId } from "./group";
import type { UserAttribute } from "./user";

export type PermissionsGraph = {
  groups: GroupsPermissions;
  revision: number;
};

export type GroupsPermissions = {
  [key: GroupId | string]: GroupPermissions;
};

export type GroupPermissions = {
  [key: DatabaseId]: DatabasePermissions;
};

export type DownloadPermission =
  | DataPermissionValue.FULL
  | DataPermissionValue.LIMITED
  | DataPermissionValue.NONE;

export type DownloadAccessPermission = {
  native?: DownloadSchemasPermission;
  schemas: DownloadSchemasPermission;
};

export type DetailsPermission =
  | DataPermissionValue.NO
  | DataPermissionValue.YES;

export type DetailsPermissions = {
  [key: DatabaseId]: DetailsPermission;
};

export type DownloadSchemasPermission =
  | DownloadPermission
  | { [key: SchemaName]: DownloadTablePermission };

export type DownloadTablePermission =
  | DownloadPermission
  | { [key: TableId]: DownloadPermission };

export type DatabasePermissions = {
  [DataPermission.VIEW_DATA]: SchemasPermissions;
  [DataPermission.CREATE_QUERIES]?: NativePermissions;
  [DataPermission.DATA_MODEL]?: DataModelPermissions;
  [DataPermission.DOWNLOAD]?: DownloadAccessPermission;
  [DataPermission.DETAILS]?: DetailsPermissions;
};

export type DataModelPermissions = {
  schemas: SchemasPermissions;
};

export type DatabaseAccessPermissions = {
  native?: NativePermissions;
  schemas: SchemasPermissions;
};

export type NativePermissions =
  | DataPermissionValue.QUERY_BUILDER_AND_NATIVE
  | DataPermissionValue.QUERY_BUILDER
  | DataPermissionValue.NO
  | undefined;

export type SchemasPermissions =
  | DataPermissionValue.UNRESTRICTED
  | DataPermissionValue.NO
  | DataPermissionValue.LEGACY_NO_SELF_SERVICE
  | DataPermissionValue.BLOCKED
  | DataPermissionValue.IMPERSONATED
  | {
      [key: SchemaName]: TablesPermissions;
    };

export type TablesPermissions =
  | DataPermissionValue.UNRESTRICTED
  | DataPermissionValue.LEGACY_NO_SELF_SERVICE
  | {
      [key: TableId]: FieldsPermissions;
    };

export type FieldsPermissions =
  | DataPermissionValue.UNRESTRICTED
  | DataPermissionValue.LEGACY_NO_SELF_SERVICE
  | DataPermissionValue.SANDBOXED;

export type CollectionPermissionsGraph = {
  groups: CollectionPermissions;
  revision: number;
};

export type CollectionPermissions = {
  [key: GroupId | string]: Partial<Record<CollectionId, CollectionPermission>>;
};

export type CollectionPermission = "write" | "read" | "none";

// FIXME: is there a more suitable type for this?
export type DimensionRef = ["dimension", any[]];

export type GroupTableAccessPolicy = {
  id: number;
  group_id: number;
  table_id: number;
  card_id: number | null;
  attribute_remappings: {
    [key: UserAttribute]: DimensionRef;
  };
  permission_id: number | null;
};

export type Impersonation = {
  db_id: DatabaseId;
  group_id: GroupId;
  attribute: UserAttribute;
};
