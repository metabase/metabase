/* @flow */

import type { DatabaseId } from "metabase-types/types/Database";
import type { SchemaName, TableId } from "metabase-types/types/Table";

export type GroupId = number;

export type Group = {
  id: GroupId,
  name: string,
};

export type PermissionsGraph = {
  groups: GroupsPermissions,
  revision: number,
};

export type GroupsPermissions = {
  [key: GroupId]: GroupPermissions,
};

export type GroupPermissions = {
  [key: DatabaseId]: DatabasePermissions,
};

export type DatabasePermissions = {
  native: NativePermissions,
  schemas: SchemasPermissions,
};

export type NativePermissions = "read" | "write" | "none";

export type SchemasPermissions =
  | "all"
  | "none"
  | {
      [key: SchemaName]: TablesPermissions,
    };

export type TablesPermissions =
  | "all"
  | "none"
  | {
      [key: TableId]: FieldsPermissions,
    };

export type FieldsPermissions = "all" | "none";
