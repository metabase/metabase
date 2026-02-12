import type {
  MetabotSuggestedTransform,
  MetabotTransformInfo,
  Transform,
} from "metabase-types/api";

export const isSavedTransformInfo = (
  transform: MetabotTransformInfo | MetabotSuggestedTransform | undefined,
): transform is MetabotTransformInfo & Transform => {
  return Boolean(transform && "source_type" in transform);
};
