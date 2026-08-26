import type {
  DatabaseId,
  SchemaName,
  Table,
  TableId,
} from "metabase-types/api";

export type NodeKey = string;

export type TreePath = {
  databaseId?: DatabaseId;
  schemaName?: SchemaName;
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
  loaded?: boolean;
};

export type SchemaNode = {
  type: "schema";
  label: string;
  key: string;
  value: { databaseId: DatabaseId; schemaName: SchemaName };
  children: TableNode[];
  loaded?: boolean;
};

export type TableNode = {
  type: "table";
  label: string;
  key: string;
  value: { databaseId: DatabaseId; schemaName: SchemaName; tableId: TableId };
  children: [];
  table?: Table;
  disabled?: boolean;
};

export type DatabaseItem = Omit<DatabaseNode, "children">;
export type SchemaItem = Omit<SchemaNode, "children">;
export type TableItem = Omit<TableNode, "children">;

export type Item = DatabaseItem | SchemaItem | TableItem;

export type ItemType = Item["type"];

export type FlatItem = LoadingItem | EmptyItem | ExpandedItem;

type ExpandedItem = Item & {
  isExpanded?: boolean;
  isLoading?: false;
  isEmpty?: false;
  parent?: NodeKey;
  level: number;
  disabled?: boolean;
};

type LoadingItem = {
  isLoading: true;
  isEmpty?: false;
  type: ItemType;
  key: string;
  level: number;
  isExpanded?: boolean;
  value?: TreePath;
  label?: string;
  parent?: NodeKey;
  table?: undefined;
  disabled?: never;
};

// Shown when a database or schema has finished loading but has no children, so
// we communicate "empty" instead of leaving a blank gap or a forever skeleton.
type EmptyItem = {
  isEmpty: true;
  isLoading?: false;
  type: ItemType;
  key: string;
  level: number;
  isExpanded?: boolean;
  value?: TreePath;
  label?: string;
  parent?: NodeKey;
  table?: undefined;
  disabled?: never;
};

export type ExpandedState = {
  [key: NodeKey]: boolean;
};

export interface ChangeOptions {
  isAutomatic?: boolean;
}
