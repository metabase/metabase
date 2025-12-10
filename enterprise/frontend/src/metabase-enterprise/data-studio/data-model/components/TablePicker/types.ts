import type {
  DatabaseId,
  SchemaName,
  Table,
  TableDataLayer,
  TableDataSource,
  TableId,
  UserId,
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

export type DatabaseItem = Omit<DatabaseNode, "children">;
export type SchemaItem = Omit<SchemaNode, "children">;
export type TableItem = Omit<TableNode, "children">;

export type Item = DatabaseItem | SchemaItem | TableItem;

export type ItemType = Item["type"];

export type FlatItem = LoadingItem | ExpandedItem;

interface ExpandedItemBase<TChild = TreeNode> {
  isExpanded?: boolean;
  isLoading?: false;
  parent?: NodeKey;
  level: number;
  disabled?: boolean;
  isSelected?: "yes" | "no" | "some";
  children: TChild[];
}

export type ExpandedItem = Item & ExpandedItemBase;

export type ExpandedSchemaItem = SchemaItem & ExpandedItemBase<TableNode>;

export type ExpandedDatabaseItem = DatabaseItem & ExpandedItemBase<SchemaNode>;

export type ExpandedTableItem = TableItem & ExpandedItemBase;

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
  children: [];
};

export type ExpandedState = {
  [key: NodeKey]: boolean;
};

export interface ChangeOptions {
  isAutomatic?: boolean;
}

export interface FilterState {
  dataLayer: TableDataLayer | null;
  dataSource: TableDataSource | "unknown" | null;
  ownerEmail: string | null;
  ownerUserId: UserId | "unknown" | null;
  unusedOnly: boolean | null;
}

export function isExpandedItem(node: FlatItem): node is ExpandedItem {
  return node.isLoading === undefined;
}

export function isDatabaseItem(node: FlatItem): node is ExpandedDatabaseItem {
  if ("isLoading" in node && node.isLoading === true) {
    return false;
  }
  return node.type === "database";
}

export function isDatabaseNode(node: TreeNode): node is DatabaseNode {
  return node.type === "database";
}

export function isSchemaNode(node: TreeNode): node is SchemaNode {
  if ("isLoading" in node && node.isLoading === true) {
    return false;
  }
  return node.type === "schema";
}

export function isSchemaItem(node: FlatItem): node is ExpandedSchemaItem {
  if ("isLoading" in node && node.isLoading === true) {
    return false;
  }
  return node.type === "schema";
}

export function isTableOrSchemaNode(
  node: ExpandedItem | TreeNode,
): node is ExpandedTableItem {
  return (
    node.type === "table" ||
    (node.type === "schema" &&
      node.children.every((child) => child.type === "table"))
  );
}

export function isTableNode(node: FlatItem): node is ExpandedTableItem;
export function isTableNode(node: TreeNode): node is TableNode;
export function isTableNode(
  node: FlatItem | TreeNode,
): node is ExpandedTableItem | TableNode {
  if ("isLoading" in node && node.isLoading === true) {
    return false;
  }
  return node.type === "table";
}
