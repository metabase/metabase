export const getModelFieldMetadataUrl = ({
  modelId,
  fieldName,
}: {
  modelId: number;
  fieldName: string;
}): string => {
  return `/bench/metadata/model/${modelId}/field/${fieldName}`;
};
