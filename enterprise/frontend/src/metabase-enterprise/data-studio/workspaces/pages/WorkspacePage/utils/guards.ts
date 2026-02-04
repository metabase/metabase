import type { MetabotSuggestedTransform } from "metabase-enterprise/metabot/state";
import type { MetabotTransformInfo, Transform } from "metabase-types/api";

export const isSavedTransformInfo = (
  transform: MetabotTransformInfo | MetabotSuggestedTransform | undefined,
): transform is MetabotTransformInfo & Transform => {
  return Boolean(transform && "source_type" in transform);
};
