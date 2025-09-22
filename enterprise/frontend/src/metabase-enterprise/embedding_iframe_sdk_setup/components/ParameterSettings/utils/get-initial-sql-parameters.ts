import type { SqlParameterValues } from "embedding-sdk-bundle/types";

export const getInitialSqlParameters = (
  parameters: SqlParameterValues,
  lockedParameters: string[] | undefined,
): SqlParameterValues => {
  if (!lockedParameters?.length) {
    return parameters;
  }

  return Object.fromEntries(
    Object.entries(parameters).filter(
      ([key]) => !lockedParameters.includes(key),
    ),
  );
};
