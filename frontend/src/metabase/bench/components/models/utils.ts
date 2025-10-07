export const getModelFieldMetadataUrl = ({
  modelId,
  fieldName,
}: {
  modelId: number;
  fieldName: string;
}): string => {
  return `/bench/model/${modelId}/metadata/field/${fieldName}`;
};
