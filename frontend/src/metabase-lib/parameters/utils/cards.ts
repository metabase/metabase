import Question from "metabase-lib/Question";
import type Metadata from "metabase-lib/metadata/Metadata";
import type {
  ParameterWithTarget,
  UiParameter,
} from "metabase-lib/parameters/types";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";
import { getParameterTargetField } from "metabase-lib/parameters/utils/targets";
import { getParametersFromCard } from "metabase-lib/parameters/utils/template-tags";
import type { Card, Parameter, ParameterTarget } from "metabase-types/api";
import { isDimensionTarget } from "metabase-types/guards";

export function getCardUiParameters(
  card: Card,
  metadata: Metadata,
  parameterValues: { [key: string]: any } = {},
  parameters = getParametersFromCard(card),
  collectionPreview?: boolean,
): UiParameter[] {
  if (!card) {
    return [];
  }

  const valuePopulatedParameters: (Parameter[] | ParameterWithTarget[]) & {
    value?: any;
  } = getValuePopulatedParameters({
    parameters,
    values: parameterValues,
    collectionPreview,
  });
  const question = new Question(card, metadata);

  return valuePopulatedParameters.map(parameter => {
    const target: ParameterTarget | undefined = (
      parameter as ParameterWithTarget
    ).target;
    const field = getParameterTargetField(target, question);
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
