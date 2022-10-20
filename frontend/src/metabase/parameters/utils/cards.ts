import _ from "underscore";

import { ParameterWithTarget, UiParameter } from "metabase/parameters/types";
import { Parameter, ParameterTarget } from "metabase-types/types/Parameter";
import { Card } from "metabase-types/types/Card";
import { getValuePopulatedParameters } from "metabase-lib/lib/parameters/utils/parameter-values";
import { getParameterTargetField } from "metabase-lib/lib/parameters/utils/targets";
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
