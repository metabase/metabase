import type { TreeNodeData } from "metabase/ui";
import type { CardId, CollectionId } from "metabase-types/api";

export interface ModelsTreeNode extends TreeNodeData {
  id: string;
  type: "collection" | "model";
  name: string;
  description?: string | null;
  modelId?: CardId;
  collectionId: CollectionId | null;
  collectionName?: string | null;
  children?: ModelsTreeNode[];
}
