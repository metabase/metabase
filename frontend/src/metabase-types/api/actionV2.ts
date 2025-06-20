import type { TableAction } from "metabase-types/api/actions";
import type { Card, CardId } from "metabase-types/api/card";
import type { CollectionId } from "metabase-types/api/collection";
import type { Database } from "metabase-types/api/database";
import type { Table, TableId } from "metabase-types/api/table";

export type ModelWithActionsItem = Pick<
  Card,
  "id" | "name" | "description" | "collection_position"
> & {
  collection_id: CollectionId;
  collection_name: string;
};

export type DatabaseWithActionsItem = Pick<Database, "id" | "name"> & {
  description: string;
};

export type TableWithActionsItem = Pick<
  Table,
  "id" | "name" | "display_name" | "description" | "schema"
>;

export interface ModelsWithActionsResponse {
  models: ModelWithActionsItem[];
}

export interface DatabasesWithActionsResponse {
  databases: DatabaseWithActionsItem[];
}

export interface TablesWithActionsResponse {
  tables: TableWithActionsItem[];
}

export interface ListActionsResponse {
  actions: TableAction[];
}

export type ListActionsResponseParams =
  | { "model-id": CardId }
  | { "table-id": TableId };
