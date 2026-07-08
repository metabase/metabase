import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import { getParameterValuesByIdFromQueryParams } from "metabase/parameters/utils/parameter-parsing";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  getDefaultValuePopulatedParameters,
  getParameterValuesBySlug,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterValuesMap } from "metabase-types/api";

/**
 * Translates an explicit `null` to `""` so the URL-querystring parser treats
 * it as a strict clear (ignore the parameter's default). Missing slugs fall
 * back to `parameter.default ?? null`.
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
 * Builds the id-keyed parameter values dispatched by the controlled push from
 * the host's slug-keyed `parameters`/`sqlParameters` prop. Missing slugs fall
 * back to `parameter.default ?? null`.
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
 * Picks which set of seed values to use on mount when both the
 * controlled (`parameters`) and uncontrolled (`initialParameters`) props are
 * available. Controlled wins when set; otherwise falls back to initial.
 * Routes both through `mapExplicitNullToEmpty` so explicit `null` consistently
 * means "strictly clear this slug" (ignore the parameter's default and last-used).
 */
export const getEffectiveParameterValues = (
  controlledParameters: ParameterValues | null | undefined,
  initialParameters: ParameterValues | undefined,
): ParameterValues =>
  mapExplicitNullToEmpty(controlledParameters ?? initialParameters ?? {});

/**
 * Builds the slug-keyed payload delivered to `onParametersChange` /
 * `onSqlParametersChange`: the currently applied values, the defaults from
 * the parameter definitions, and (dashboards only) the last-used values for
 * this user. The `lastUsedParameters` field is included only when its
 * argument is provided.
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
