import type { TreeNodeData } from "metabase/ui";
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

export interface TablePickerTreeNode extends TreeNodeData {
  id: string;
  type: "database" | "schema" | "table";
  name: string;
  nodeKey: string;
  databaseId?: DatabaseId;
  schemaName?: SchemaName;
  tableId?: TableId;
  table?: Table;
  isDisabled?: boolean;
  children?: TablePickerTreeNode[];
}

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

export function isDatabaseNode(node: TreeNode): node is DatabaseNode {
  return node.type === "database";
}

export function isSchemaNode(node: TreeNode): node is SchemaNode {
  return node.type === "schema";
}

export function isTableNode(node: TreeNode): node is TableNode {
  return node.type === "table";
}
