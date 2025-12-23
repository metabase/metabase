import type { IconName } from "metabase/ui";
import type { Transform } from "metabase-types/api";

export type TreeNodeType = "folder" | "transform" | "library";

export type TreeNode = {
  id: string;
  name: string;
  nodeType: TreeNodeType;
  icon: IconName;
  updated_at?: string;
  target?: Transform["target"];
  children?: TreeNode[];
  transformId?: number;
  collectionId?: number;
  url?: string;
};

export function isCollectionNode(
  node: TreeNode,
): node is TreeNode & { collectionId: number } {
  return node.nodeType === "folder" && typeof node.collectionId === "number";
}

export function getCollectionNodeId(collectionId: number): string {
  return `collection-${collectionId}`;
}

export function getTransformNodeId(transformId: number): string {
  return `transform-${transformId}`;
}
