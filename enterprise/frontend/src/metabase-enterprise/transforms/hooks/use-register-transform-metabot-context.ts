import { useRegisterMetabotContextProvider } from "metabase/metabot";
import type {
  DraftTransformSource,
  SuggestedTransform,
  TaggedTransform,
  Transform,
  TransformTarget,
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
    if (!source) {
      return {};
    }

    // Extract only the fields needed for metabot context, explicitly set type to "transform"
    const id = transform && "id" in transform ? transform.id : undefined;
    const name = transform?.name;
    const description =
      transform && "description" in transform ? transform.description : null;
    // For UnsavedTransform, target doesn't have the full structure expected by metabot
    const target: TransformTarget | undefined =
      transform && "target" in transform && "schema" in transform.target
        ? (transform.target as TransformTarget)
        : undefined;

    return {
      user_is_viewing: [
        {
          type: "transform" as const,
          id,
          name,
          description,
          target,
          source,
        },
      ],
    };
  }, [transform, source]);
};
