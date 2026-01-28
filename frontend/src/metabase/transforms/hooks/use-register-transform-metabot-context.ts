import { useRegisterMetabotContextProvider } from "metabase/metabot";
import type {
  PythonTransformSourceDraft,
  SuggestedTransform,
  Transform,
  TransformSource,
} from "metabase-types/api";

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
