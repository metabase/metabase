import _ from "underscore";

import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  ParameterWithTarget,
  UiParameter,
} from "metabase-lib/v1/parameters/types";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import { getParameterTargetField } from "metabase-lib/v1/parameters/utils/targets";
import { getParametersFromCard } from "metabase-lib/v1/parameters/utils/template-tags";
import type {
  Parameter,
  ParameterTarget,
  ParameterValuesMap,
  SeriesCard,
} from "metabase-types/api";
import { isDimensionTarget } from "metabase-types/guards";

export function getCardUiParameters(
  card: SeriesCard,
  metadata: Metadata,
  parameterValues: ParameterValuesMap = {},
  parameters = getParametersFromCard(card, metadata),
): UiParameter[] {
  if (!card) {
    return [];
  }

  const valuePopulatedParameters: Parameter[] | ParameterWithTarget[] =
    getValuePopulatedParameters({
      parameters,
      values: parameterValues,
    });

  return hasParamFields(card)
    ? getSavedCardUiParameters(card, valuePopulatedParameters)
    : getUnsavedCardUiParameters(card, metadata, valuePopulatedParameters);
}

/**
 * A question opened from a dashboard shows the dashboard's parameters, which
 * the card's own `param_fields` do not cover.
 */
function hasParamFields(card: SeriesCard) {
  return card.id != null && card.dashboardId == null;
}

/**
 * Saved cards carry `param_fields` hydrated by the backend, so parameter
 * fields are resolved from them rather than from the query, which can be
 * stripped (public and static-embed payloads) or require metadata the
 * frontend does not have.
 */
function getSavedCardUiParameters(
  card: SeriesCard,
  parameters: Parameter[] | ParameterWithTarget[],
): UiParameter[] {
  return parameters.map((parameter) => {
    const target = getParameterTarget(parameter);
    const fields = _.uniq(
      card.param_fields?.[parameter.id] ?? [],
      (field) => field.id,
    );
    if (fields.length > 0) {
      return {
        ...parameter,
        fields,
        hasVariableTemplateTagTarget: false,
      };
    }

    return {
      ...parameter,
      hasVariableTemplateTagTarget: !isDimensionTarget(target),
    };
  });
}

/**
 * Unsaved cards have no `param_fields`, so parameter targets are resolved
 * against the query.
 */
function getUnsavedCardUiParameters(
  card: SeriesCard,
  metadata: Metadata,
  parameters: Parameter[] | ParameterWithTarget[],
): UiParameter[] {
  const question = new Question(card, metadata);

  return parameters.map((parameter) => {
    const target = getParameterTarget(parameter);
    const field =
      target != null
        ? getParameterTargetField(question, parameter, target)
        : null;
    if (field) {
      return {
        ...parameter,
        fields: [field],
        hasVariableTemplateTagTarget: false,
      };
    }

    return {
      ...parameter,
      hasVariableTemplateTagTarget: !isDimensionTarget(target),
    };
  });
}

function getParameterTarget(
  parameter: Parameter | ParameterWithTarget,
): ParameterTarget | undefined {
  return "target" in parameter ? parameter.target : undefined;
}
