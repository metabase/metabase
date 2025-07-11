import type { Card, CardId } from "metabase-types/api/card";
import type { CollectionId } from "metabase-types/api/collection";
import type { Database } from "metabase-types/api/database";
import type { Table, TableId } from "metabase-types/api/table";

export type ModelWithActionsItem = Pick<
  Card,
  "id" | "name" | "description" | "collection_position"
> & {
  collection_id: CollectionId | null;
  collection_name: string | null;
};

export type DatabaseWithActionsItem = Pick<Database, "id" | "name"> & {
  description: string;
};

export type TableWithActionsItem = Pick<
  Table,
  "id" | "name" | "display_name" | "description" | "schema"
>;

export type ListActionItem = {
  id: number;
  name: string;
  description: string;
};

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
  actions: ListActionItem[];
}

export type ListActionsRequestParams =
  | { "model-id": CardId }
  | { "table-id": TableId };
