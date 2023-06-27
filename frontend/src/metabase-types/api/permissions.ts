import type { DatabaseId, TableId, SchemaName } from "metabase-types/api";
import { GroupId } from "./group";
import { UserAttribute } from "./user";

export type PermissionsGraph = {
  groups: GroupsPermissions;
  revision: number;
};

export type GroupsPermissions = {
  [key: GroupId]: GroupPermissions;
};

export type GroupPermissions = {
  [key: DatabaseId]: DatabasePermissions;
};

export type DownloadPermission = "full" | "limited" | "none";

export type DownloadAccessPermission = {
  native?: DownloadSchemasPermission;
  schemas: DownloadSchemasPermission;
};

export type DetailsPermission = "no" | "yes";

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
  data: DatabaseAccessPermissions;
  "data-model"?: DataModelPermissions;
  download?: DownloadAccessPermission;
  details?: DetailsPermissions;
};

export type DataModelPermissions = {
  schemas: SchemasPermissions;
};

export type DatabaseAccessPermissions = {
  native?: NativePermissions;
  schemas: SchemasPermissions;
};

export type NativePermissions = "write" | undefined;

export type SchemasPermissions =
  | "all"
  | "none"
  | "block"
  | "impersonated"
  | {
      [key: SchemaName]: TablesPermissions;
    };

export type TablesPermissions =
  | "all"
  | "none"
  | {
      [key: TableId]: FieldsPermissions;
    };

export type FieldsPermissions =
  | "all"
  | "none"
  | {
      read: "all";
      query: "segmented";
    };

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
