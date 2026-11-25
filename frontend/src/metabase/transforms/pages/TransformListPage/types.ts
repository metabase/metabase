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
  owner?: TransformOwner | null;
  owner_email?: string | null;
  children?: TreeNode[];
  transformId?: number;
  collection?: Collection;
  url?: string;
  can_read?: boolean;
  warningTooltip?: string;
};

/** A folder row of the tree, with the collection it stands for. */
export type CollectionNode = TreeNode & { collection: Collection };

export function isCollectionNode(node: TreeNode): node is CollectionNode {
  return node.nodeType === "folder" && typeof node.collection?.id === "number";
}

export function getCollectionNodeId(collectionId: number): string {
  return `collection-${collectionId}`;
}

export function getTransformNodeId(transformId: number): string {
  return `transform-${transformId}`;
}

export type DeleteTransformsFolderModalState = {
  type: "delete";
  folder: CollectionNode;
};

export type TransformsFolderModalState =
  | CollectionRowModalState
  | DeleteTransformsFolderModalState;
