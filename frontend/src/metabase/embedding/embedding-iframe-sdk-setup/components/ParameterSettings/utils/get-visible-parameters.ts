import type { SqlParameterValues } from "embedding-sdk-bundle/types";
import type { ParameterValues } from "metabase-types/api";

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
    return parameters;
  }

  const filteredParameters = Object.fromEntries(
    Object.entries(parameters).filter(
      ([key]) => !lockedParameters.includes(key),
    ),
  ) as TParameters;

  if (Object.keys(filteredParameters).length === 0) {
    return undefined;
  }

  return filteredParameters;
};
