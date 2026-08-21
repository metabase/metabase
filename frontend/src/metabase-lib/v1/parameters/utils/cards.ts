import _ from "underscore";

import { isNotNull } from "metabase/utils/types";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import { getParameterTargetField } from "metabase-lib/v1/parameters/utils/targets";
import { getParametersFromCard } from "metabase-lib/v1/parameters/utils/template-tags";
import type { Card, Parameter } from "metabase-types/api";
import { isDimensionTarget } from "metabase-types/guards";

// Cards from the public and static-embed endpoints have their real query
// stripped but carry `param_fields`, so parameter fields are resolved from
// them; full cards fall back to resolving parameter targets against the query.
export function getCardUiParameters(
  card: Card,
  metadata: Metadata,
  parameterValues: { [key: string]: any } = {},
  parameters?: Parameter[],
): UiParameter[] {
  if (!_.isEmpty(card.param_fields)) {
    return getCardUiParametersFromParamFields(card, metadata, parameterValues);
  }

  return getCardUiParametersFromQuery(
    card,
    metadata,
    parameterValues,
    parameters,
  );
}

export function getCardUiParametersFromQuery(
  card: Card,
  metadata: Metadata,
  parameterValues: { [key: string]: any } = {},
  parameters = getParametersFromCard(card, metadata),
): UiParameter[] {
  if (!card) {
    return [];
  }

  const valuePopulatedParameters = getValuePopulatedParameters({
    parameters,
    values: parameterValues,
  });
  const question = new Question(card, metadata);

  return valuePopulatedParameters.map((parameter) => {
    const { target } = parameter;
    const field = getParameterTargetField(question, parameter, target);
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

// Builds UI parameters from `card.param_fields` instead of resolving parameter
// targets against `card.dataset_query`. Public and static-embed card payloads
// do not include the real query, so this is the only way to get parameter
// fields there.
export function getCardUiParametersFromParamFields(
  card: Card,
  metadata: Metadata,
  parameterValues: { [key: string]: any } = {},
): UiParameter[] {
  const valuePopulatedParameters = getValuePopulatedParameters({
    parameters: getParametersFromCard(card, metadata),
    values: parameterValues,
  });

  return valuePopulatedParameters.map((parameter) => {
    const { target } = parameter;
    const parameterFields = (card.param_fields?.[parameter.id] ?? [])
      .map((field) => metadata.field(field.id))
      .filter(isNotNull);
    const fields = _.uniq(parameterFields, (field) => field.id);
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
