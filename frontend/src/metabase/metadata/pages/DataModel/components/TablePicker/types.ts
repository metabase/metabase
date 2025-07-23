import type {
  DatabaseId,
  SchemaName,
  Table,
  TableId,
  TransformId,
} from "metabase-types/api";

export type NodeKey = string;

export type TreePath = {
  databaseId?: DatabaseId;
  schemaName?: SchemaName;
  tableId?: TableId;
  sectionId?: "transform";
  transformId?: TransformId;
};

export type TreeNode =
  | RootNode
  | DatabaseNode
  | SchemaNode
  | TableNode
  | TransformNode
  | TransformListNode;

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
  children: (SchemaNode | TransformListNode)[];
};

export type SchemaNode = {
  type: "schema";
  label: string;
  key: string;
  value: { databaseId: DatabaseId; schemaName: SchemaName };
  children: TableNode[];
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

export type TransformNode = {
  type: "transform";
  key: NodeKey;
  label: string;
  value: {
    databaseId: DatabaseId;
    sectionId: "transform";
    transformId: TransformId;
  };
  children: [];
};

export type TransformListNode = {
  type: "transform-list";
  key: NodeKey;
  label: string;
  value: { databaseId: DatabaseId; sectionId: "transform" };
  children: TransformNode[];
};

export type DatabaseItem = Omit<DatabaseNode, "children">;
export type SchemaItem = Omit<SchemaNode, "children">;
export type TableItem = Omit<TableNode, "children">;
export type TransformItem = Omit<TransformNode, "children">;
export type TransformListItem = Omit<TransformListNode, "children">;

export type Item =
  | DatabaseItem
  | SchemaItem
  | TableItem
  | TransformItem
  | TransformListItem;

export type ItemType = Item["type"];

export type FlatItem = LoadingItem | ExpandedItem;

type ExpandedItem = Item & {
  isExpanded?: boolean;
  isLoading?: false;
  parent?: NodeKey;
  level: number;
  disabled?: boolean;
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
  table?: undefined;
  disabled?: never;
};

export type ExpandedState = {
  [key: NodeKey]: boolean;
};

export interface ChangeOptions {
  isAutomatic?: boolean;
}
