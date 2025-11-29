import type { SqlParameterValues } from "embedding-sdk-bundle/types";
import type { ParameterValues } from "metabase-types/api";

const getNormalizedParameters = <
  TParameters extends ParameterValues | SqlParameterValues,
>(
  parameters: TParameters,
) => (Object.keys(parameters).length > 0 ? parameters : undefined);

export const getVisibleParameters = <
  TParameters extends ParameterValues | SqlParameterValues,
>(
  parameters: TParameters | undefined,
  lockedParameters: string[] | undefined,
): TParameters | undefined => {
  if (!parameters) {
    return parameters;
  }

  if (!lockedParameters?.length) {
    return getNormalizedParameters(parameters);
  }

  const filteredParameters = Object.fromEntries(
    Object.entries(parameters).filter(
      ([key]) => !lockedParameters.includes(key),
    ),
  ) as TParameters;

  return getNormalizedParameters(filteredParameters);
};
