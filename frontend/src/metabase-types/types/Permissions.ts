import { DatabaseId } from "metabase-types/types/Database";
import { SchemaName, TableId } from "metabase-types/types/Table";

export type GroupId = number;

export type Group = {
  id: GroupId;
  name: string;
};

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

export type DataAccessPermission = "read" | "write" | "none";

export type DatabasePermissions = {
  native: DataAccessPermission;
  schemas: SchemasPermissions;
};

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
