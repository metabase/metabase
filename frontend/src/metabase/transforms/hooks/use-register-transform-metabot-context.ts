import { P, match } from "ts-pattern";

import { useRegisterMetabotContextProvider } from "metabase/metabot";
import type {
  DatasetError,
  DraftTransformSource,
  MetabotTransformInfo,
  SuggestedTransform,
  TaggedTransform,
  Transform,
  UnsavedTransform,
} from "metabase-types/api";

type AnyTransform =
  | Transform
  | TaggedTransform
  | UnsavedTransform
  | SuggestedTransform;

const getTransformErrorMessage = (
  error: DatasetError | undefined,
): string | undefined =>
  match(error)
    .with(P.nullish, () => undefined)
    .with(P.string, (message) => message)
    .with({ data: P.string }, ({ data }) => data)
    .with(
      P.when((value) => typeof value === "object" && value !== null),
      (datasetError) => JSON.stringify(datasetError),
    )
    .otherwise((value) => String(value));

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
