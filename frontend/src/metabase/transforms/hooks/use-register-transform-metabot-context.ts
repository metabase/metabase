import { useRegisterMetabotContextProvider } from "metabase/metabot";
import type {
  DatasetError,
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

const getTransformErrorMessage = (
  error: DatasetError | undefined,
): string | undefined => {
  if (!error) {
    return undefined;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object") {
    const data = error.data;

    if (typeof data === "string") {
      return data;
    }

    return JSON.stringify(error);
  }

  return String(error);
};

export const registerTransformMetabotContextFn = ({
  transform,
  source,
  error,
}: {
  transform: AnyTransform | undefined;
  source?: DraftTransformSource;
  error?: DatasetError;
}) => {
  if (!transform && !source) {
    return {};
  }

  const errorMessage = getTransformErrorMessage(error);

  return {
    user_is_viewing: [
      {
        ...transform,
        type: "transform",
        ...(source !== undefined && { source }),
        ...(errorMessage !== undefined && { error: errorMessage }),
      } as MetabotTransformInfo,
    ],
  };
};

export const useRegisterMetabotTransformContext = (
  transform: AnyTransform | undefined,
  source?: DraftTransformSource,
  error?: DatasetError,
) => {
  useRegisterMetabotContextProvider(async () => {
    return registerTransformMetabotContextFn({ transform, source, error });
  }, [transform, source, error]);
};
