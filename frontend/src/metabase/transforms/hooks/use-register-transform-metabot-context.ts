import { useRegisterMetabotContextProvider } from "metabase/metabot";
import type {
  DraftTransformSource,
  MetabotTransformInfo,
  SuggestedTransform,
  TaggedTransform,
  Transform,
  UnsavedTransform,
  WorkspaceTransform,
} from "metabase-types/api";

type AnyTransform =
  | Transform
  | TaggedTransform
  | WorkspaceTransform
  | UnsavedTransform
  | SuggestedTransform;

export const useRegisterMetabotTransformContext = (
  transform: AnyTransform | undefined,
  source?: DraftTransformSource,
) => {
  useRegisterMetabotContextProvider(async () => {
    if (!transform && !source) {
      return {};
    }

    return {
      user_is_viewing: [
        {
          ...transform,
          type: "transform",
          ...(source !== undefined && { source }),
        } as MetabotTransformInfo,
      ],
    };
  }, [transform, source]);
};
