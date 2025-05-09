import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

export type NodeKey = string;

export type TreePath = {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
  tableId?: TableId;
};

type RootNode = {
  type: "root";
  label: "";
  children: TreeNode[];
};

export type TreeNode = RootNode | (Item & { children: TreeNode[] });

export type DatabaseItem = {
  type: "database";
  label: string;
  key: NodeKey;
  value: { databaseId: DatabaseId };
};

export type SchemaItem = {
  type: "schema";
  label: string;
  key: string;
  value: { databaseId: DatabaseId; schemaId: SchemaId };
};

export type TableItem = {
  type: "table";
  label: string;
  key: string;
  value: { databaseId: DatabaseId; schemaId: SchemaId; tableId: TableId };
};

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
