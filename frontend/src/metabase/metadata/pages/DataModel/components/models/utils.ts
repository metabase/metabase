import type { CollectionId } from "metabase-types/api";

export const getModelFieldMetadataUrl = ({
  collectionId,
  modelId,
  fieldName,
}: {
  collectionId: CollectionId;
  modelId: number;
  fieldName: string;
}): string => {
  return `/bench/metadata/collection/${collectionId}/model/${modelId}/field/${fieldName}`;
};
