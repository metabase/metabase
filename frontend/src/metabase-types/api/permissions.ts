import { DatabaseId } from "metabase-types/types/Database";
import { SchemaName, TableId } from "metabase-types/types/Table";
import { GroupId } from "./group";

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
  download: DownloadAccessPermission;
  details: DetailsPermissions;
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
