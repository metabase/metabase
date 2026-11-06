import type { CollectionRowModalState } from "metabase/common/collections/components/CollectionRowModal";
import type {
  Collection,
  IconName,
  Transform,
  TransformOwner,
} from "metabase-types/api";

export type TreeNodeType = "folder" | "transform" | "library";

export type TreeNode = {
  id: string;
  name: string;
  nodeType: TreeNodeType;
  icon: IconName;
  updated_at?: string;
  target?: Transform["target"];
  target_table_id?: Transform["target_table_id"];
  owner?: TransformOwner | null;
  owner_email?: string | null;
  children?: TreeNode[];
  transformId?: number;
  collection?: Collection;
  url?: string;
  can_read?: boolean;
  can_write?: boolean;
  warningTooltip?: string;
};

export function isCollectionNode(
  node: TreeNode,
): node is TreeNode & { collection: Collection } {
  return node.nodeType === "folder" && typeof node.collection?.id === "number";
}

export function getCollectionNodeId(collectionId: number): string {
  return `collection-${collectionId}`;
}

export function getTransformNodeId(transformId: number): string {
  return `transform-${transformId}`;
}

export type FolderTransform = Pick<
  Transform,
  "id" | "name" | "can_write" | "target_table_id"
> &
  Partial<Pick<Transform, "target">>;

export type DeleteTransformsFolderModalState = {
  type: "delete";
  collection: Collection;
  transforms: FolderTransform[];
};

export type TransformsFolderModalState =
  | CollectionRowModalState
  | DeleteTransformsFolderModalState;
