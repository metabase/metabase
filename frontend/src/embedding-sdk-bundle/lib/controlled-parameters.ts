import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getParameterValuesByIdFromQueryParams } from "metabase-lib/v1/parameters/utils/parameter-parsing";
import {
  getDefaultValuePopulatedParameters,
  getParameterValuesBySlug,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterValuesMap } from "metabase-types/api";

export const mapExplicitNullToEmpty = (
  values: ParameterValues,
): ParameterValues => {
  const result: ParameterValues = {};

  for (const [slug, value] of Object.entries(values)) {
    // Map explicit `null` values to `""` to align with the URL-querystring convention
    result[slug] = value === null ? "" : value;
  }

  return result;
};

export const buildControlledParameters = (
  parameters: ParameterValues,
  parameterDefinitions: UiParameter[],
): ParameterValuesMap =>
  getParameterValuesByIdFromQueryParams(
    parameterDefinitions,
    mapExplicitNullToEmpty(parameters),
  );

export const resolveSeedParameterValues = (
  controlledParameters: ParameterValues | null | undefined,
  initialParameters: ParameterValues | undefined,
): ParameterValues => {
  if (controlledParameters === null || controlledParameters === undefined) {
    return initialParameters ?? {};
  }

  return mapExplicitNullToEmpty(controlledParameters);
};

export function buildParametersPayload(
  applied: ParameterValuesMap,
  parameterDefinitions: UiParameter[],
): { parameters: ParameterValues; defaultParameters: ParameterValues };
export function buildParametersPayload(
  applied: ParameterValuesMap,
  parameterDefinitions: UiParameter[],
  lastUsedParameterValues: ParameterValuesMap,
): {
  parameters: ParameterValues;
  defaultParameters: ParameterValues;
  lastUsedParameters: ParameterValues;
};
export function buildParametersPayload(
  applied: ParameterValuesMap,
  parameterDefinitions: UiParameter[],
  lastUsedParameterValues?: ParameterValuesMap,
) {
  return {
    parameters: getParameterValuesBySlug(parameterDefinitions, applied),
    defaultParameters: getParameterValuesBySlug(
      getDefaultValuePopulatedParameters(parameterDefinitions, {}),
      {},
    ),
    ...(lastUsedParameterValues && {
      lastUsedParameters: getParameterValuesBySlug(
        parameterDefinitions,
        lastUsedParameterValues,
      ),
    }),
  };
}
