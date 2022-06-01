import { DatabaseId } from "metabase-types/api/database";
import { GroupId } from "metabase-types/api/group";
import { SchemaName, TableId } from "metabase-types/api/table";

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
  "data-model": DataModelPermissions;
  download: DownloadAccessPermission;
  details: DetailsPermissions;
};

export type DataModelPermissions = {
  schemas: SchemasPermissions;
};

export type DatabaseAccessPermissions = {
  native: NativePermissions;
  schemas: SchemasPermissions;
};

export type NativePermissions = "read" | "write" | "none";

export type SchemasPermissions =
  | "all"
  | "none"
  | {
      [key: SchemaName]: TablesPermissions;
    };

export type TablesPermissions =
  | "all"
  | "none"
  | {
      [key: TableId]: FieldsPermissions;
    };

export type FieldsPermissions = "all" | "none";
