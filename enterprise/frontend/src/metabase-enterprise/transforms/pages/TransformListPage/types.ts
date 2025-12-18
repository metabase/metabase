import type { IconName } from "metabase/ui";
import type { Transform } from "metabase-types/api";

export type TreeNodeType = "folder" | "transform";

export type TreeNode = {
  id: string;
  name: string;
  nodeType: TreeNodeType;
  icon: IconName;
  updated_at?: string;
  target?: Transform["target"];
  children?: TreeNode[];
  transformId?: number;
};

export function getCollectionNodeId(collectionId: number): string {
  return `collection-${collectionId}`;
}

export function getTransformNodeId(transformId: number): string {
  return `transform-${transformId}`;
}
