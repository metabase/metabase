import _ from "underscore";

import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  areParameterValuesIdentical,
  parameterHasNoDisplayValue,
} from "metabase-lib/v1/parameters/utils/parameter-values";
import type { DashboardCard, Parameter, ParameterId } from "metabase-types/api";

export function syncParametersAndEmbeddingParams(before: any, after: any) {
  if (after.parameters && before.embedding_params && before.enable_embedding) {
    return Object.keys(before.embedding_params).reduce((memo, embedSlug) => {
      const slugParam = _.find(before.parameters, (param) => {
        return param.slug === embedSlug;
      });
      if (slugParam) {
        const slugParamId = slugParam && slugParam.id;
        const newParam = _.findWhere(after.parameters, { id: slugParamId });
        if (newParam) {
          memo[newParam.slug] = before.embedding_params[embedSlug];
        }
      }
      return memo;
    }, {} as any);
  } else {
    return before.embedding_params;
  }
}

export function canResetFilter(parameter: UiParameter): boolean {
  const hasDefaultValue = !parameterHasNoDisplayValue(parameter.default);
  const hasValue = !parameterHasNoDisplayValue(parameter.value);

  if (hasDefaultValue) {
    return !areParameterValuesIdentical(
      wrapArray(parameter.value),
      wrapArray(parameter.default),
    );
  }

  return hasValue;
}

function wrapArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

export function getMappedParametersIds(
  dashcards: DashboardCard[],
): ParameterId[] {
  return dashcards.flatMap((dashcard: DashboardCard) => {
    const mappings = dashcard.parameter_mappings ?? [];
    return mappings.map((parameter) => parameter.parameter_id);
  });
}

/**
 * Reorders a dashboard header parameter within the full parameters array.
 *
 * Since `dashboard.parameters` includes both header and inline (dashcard) parameters,
 * this function ensures that the header parameters are correctly reordered while
 * maintaining the integrity of the full parameters array.
 */
export function setDashboardHeaderParameterIndex(
  parameters: Parameter[],
  headerParameterIds: ParameterId[],
  parameterId: ParameterId,
  index: number,
) {
  const headerIndex = headerParameterIds.indexOf(parameterId);
  const fullIndex = parameters.findIndex((p) => p.id === parameterId);

  if (headerIndex === -1 || fullIndex === -1 || headerIndex === index) {
    return parameters;
  }

  const reorderedHeaders = [...headerParameterIds];
  reorderedHeaders.splice(headerIndex, 1);
  reorderedHeaders.splice(index, 0, parameterId);

  let targetIndex = 0;

  if (index > 0) {
    const prevHeaderId = reorderedHeaders[index - 1];
    const prevIndex = parameters.findIndex((p) => p.id === prevHeaderId);
    if (prevIndex >= 0) {
      targetIndex = prevIndex + 1;
    }
  }

  const result = [...parameters];
  const [movedParam] = result.splice(fullIndex, 1);

  if (fullIndex < targetIndex) {
    targetIndex--;
  }

  result.splice(targetIndex, 0, movedParam);
  return result;
}
