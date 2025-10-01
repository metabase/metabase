import { PythonTransformSourceDraft } from "metabase-enterprise/transforms-python/components/PythonTransformEditor";
import {
  SuggestedTransform,
  Transform,
  TransformSource,
} from "metabase-types/api";
import { useRegisterMetabotContextProvider } from "metabase/metabot";

export const useRegisterMetabotTransformContext = (
  transform: Transform | SuggestedTransform | undefined,
  source: TransformSource | PythonTransformSourceDraft,
) => {
  useRegisterMetabotContextProvider(async () => {
    return {
      user_is_viewing: [{ type: "transform", ...(transform || {}), source }],
    };
  }, [transform, source]);
};
