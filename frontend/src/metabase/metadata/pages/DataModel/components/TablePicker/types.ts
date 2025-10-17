import type {
  CardId,
  CollectionId,
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

  collectionId?: CollectionId;
  modelId?: CardId;
};

export type TreeNode =
  | RootNode
  | DatabaseNode
  | SchemaNode
  | TableNode
  | CollectionNode
  | ModelNode;

export type RootNode = {
  type: "root";
  key: string;
  label: "";
  value: Record<string, never>;
  children: (DatabaseNode | CollectionNode | ModelNode)[];
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

export type CollectionNode = {
  type: "collection";
  label: string;
  key: string;
  value: { collectionId: CollectionId };
  children: ModelNode[];
  hasNoValidChildren?: boolean;
};

export type ModelNode = {
  type: "model";
  label: string;
  key: string;
  value: { collectionId: CollectionId; modelId: CardId };
  children: [];
};

export type DatabaseItem = Omit<DatabaseNode, "children">;
export type SchemaItem = Omit<SchemaNode, "children">;
export type TableItem = Omit<TableNode, "children">;
export type CollectionItem = Omit<CollectionNode, "children">;
export type ModelItem = Omit<ModelNode, "children">;

export type Item =
  | DatabaseItem
  | SchemaItem
  | TableItem
  | CollectionItem
  | ModelItem;

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
