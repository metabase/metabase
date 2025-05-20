import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

export type NodeKey = string;

export type TreePath = {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
  tableId?: TableId;
};

export type TreeNode = RootNode | DatabaseNode | SchemaNode | TableNode;

export type RootNode = {
  type: "root";
  key: string;
  label: "";
  value: Record<string, never>;
  children: DatabaseNode[];
};

export type DatabaseNode = {
  type: "database";
  label: string;
  key: NodeKey;
  value: { databaseId: DatabaseId };
  children: SchemaNode[];
};

export type SchemaNode = {
  type: "schema";
  label: string;
  key: string;
  value: { databaseId: DatabaseId; schemaId: SchemaId };
  children: TableNode[];
};

export type TableNode = {
  type: "table";
  label: string;
  key: string;
  value: { databaseId: DatabaseId; schemaId: SchemaId; tableId: TableId };
  children: [];
};

export type DatabaseItem = Omit<DatabaseNode, "children">;
export type SchemaItem = Omit<SchemaNode, "children">;
export type TableItem = Omit<TableNode, "children">;

export type Item = DatabaseItem | SchemaItem | TableItem;

export type ItemType = Item["type"];

export type FlatItem = LoadingItem | ExpandedItem;

type ExpandedItem = Item & {
  isExpanded?: boolean;
  isLoading?: false;
  parent?: NodeKey;
  level: number;
};

type LoadingItem = {
  isLoading: true;
  type: ItemType;
  key: string;
  level: number;
  isExpanded?: boolean;
  value?: TreePath;
  label?: string;
  parent?: NodeKey;
};

export type ExpandedState = {
  [key: NodeKey]: boolean;
};
