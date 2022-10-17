import _ from "underscore";

import { ParameterWithTarget, UiParameter } from "metabase/parameters/types";
import { Parameter, ParameterTarget } from "metabase-types/types/Parameter";
import { Card } from "metabase-types/types/Card";
import { TemplateTag } from "metabase-types/types/Query";
import {
  getValuePopulatedParameters,
  hasParameterValue,
} from "metabase-lib/lib/parameters/utils/parameter-values";
import {
  getParameterTargetField,
  getTemplateTagFromTarget,
} from "metabase-lib/lib/parameters/utils/targets";
import Question from "metabase-lib/lib/Question";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import { getParametersFromCard } from "metabase-lib/lib/parameters/utils/template-tags";

export function getCardUiParameters(
  card: Card,
  metadata: Metadata,
  parameterValues: { [key: string]: any } = {},
  parameters = getParametersFromCard(card),
): UiParameter[] {
  if (!card) {
    return [];
  }

  const valuePopulatedParameters: (Parameter[] | ParameterWithTarget[]) & {
    value?: any;
  } = getValuePopulatedParameters(parameters, parameterValues);
  const question = new Question(card, metadata);

  return valuePopulatedParameters.map(parameter => {
    const target: ParameterTarget | undefined = (
      parameter as ParameterWithTarget
    ).target;
    const field = getParameterTargetField(target, metadata, question);
    if (field) {
      return {
        ...parameter,
        fields: [field],
        hasVariableTemplateTagTarget: false,
      };
    }

    return { ...parameter, hasVariableTemplateTagTarget: true };
  });
}

// when navigating from dashboard --> saved native question,
// we are given dashboard parameters and a map of dashboard parameter ids to parameter values
// we need to transform this into a map of template tag ids to parameter values
// so that we popoulate the template tags in the native editor
export function remapParameterValuesToTemplateTags(
  templateTags: TemplateTag[],
  dashboardParameters: ParameterWithTarget[],
  parameterValuesByDashboardParameterId: {
    [key: string]: any;
  },
) {
  const parameterValues: {
    [key: string]: any;
  } = {};
  const templateTagParametersByName = _.indexBy(templateTags, "name");

  dashboardParameters.forEach(dashboardParameter => {
    const { target } = dashboardParameter;
    const tag = getTemplateTagFromTarget(target);

    if (tag != null && templateTagParametersByName[tag]) {
      const templateTagParameter = templateTagParametersByName[tag];
      const parameterValue =
        parameterValuesByDashboardParameterId[dashboardParameter.id];
      if (hasParameterValue(parameterValue)) {
        parameterValues[templateTagParameter.name] = parameterValue;
      }
    }
  });

  return parameterValues;
}
