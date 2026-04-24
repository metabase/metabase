import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getParameterValuesByIdFromQueryParams } from "metabase-lib/v1/parameters/utils/parameter-parsing";
import {
  getDefaultValuePopulatedParameters,
  getParameterValuesBySlug,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterValuesMap } from "metabase-types/api";

/**
 * Map explicit `null` values to `""` to align with the URL-querystring convention
 */
export const mapExplicitNullToEmpty = (
  values: ParameterValues,
): ParameterValues => {
  const result: ParameterValues = {};

  for (const [slug, value] of Object.entries(values)) {
    result[slug] = value === null ? "" : value;
  }

  return result;
};

/**
 * Build the id-keyed `ParameterValuesMap` to dispatch from a controlled
 * `parameters` push. See `mapExplicitNullToEmpty` for the resolution
 * rules.
 */
export const buildControlledParameters = (
  parameters: ParameterValues,
  parameterDefinitions: UiParameter[],
): ParameterValuesMap =>
  getParameterValuesByIdFromQueryParams(
    parameterDefinitions,
    mapExplicitNullToEmpty(parameters),
  );

/**
 * Build the slug-keyed snapshot of applied + default values shared by
 * `DashboardParameterChangePayload` and `SqlParameterChangePayload`.
 *
 * `lastUsedParameters` is only included when `lastUsedParameterValues`
 * is provided (dashboards have it from the BE; questions don't — and
 * the question payload spec omits the field entirely, not as `{}`).
 */
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
