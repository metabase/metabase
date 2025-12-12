import { useRegisterMetabotContextProvider } from "metabase/metabot";
import type {
  DraftTransformSource,
  SuggestedTransform,
  Transform,
} from "metabase-types/api";

export const useRegisterMetabotTransformContext = (
  transform: Transform | SuggestedTransform | undefined,
  source?: DraftTransformSource,
) => {
  useRegisterMetabotContextProvider(async () => {
    if (!source) {
      return {};
    }

    return {
      user_is_viewing: [{ type: "transform", ...(transform || {}), source }],
    };
  }, [transform, source]);
};
