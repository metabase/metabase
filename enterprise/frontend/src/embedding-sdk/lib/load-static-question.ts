import { CardApi } from "metabase/services";
import type { Card, Dataset, ParameterQueryObject } from "metabase-types/api";

interface Options {
  questionId: number;
  parameterValues?: Record<string, string | number>;
}

type ParameterQueryInput = { id: string } & ParameterQueryObject;

export async function loadStaticQuestion(options: Options) {
  const { questionId, parameterValues } = options;

  let card: Card | null;
  let result: Dataset | null;

  [card, result] = await Promise.all([
    CardApi.get({ cardId: questionId }),

    // Query the card in parallel when no parameters are provided.
    !parameterValues && CardApi.query({ cardId: questionId }),
  ]);

  if (parameterValues && card?.parameters) {
    const parameters: ParameterQueryInput[] = card.parameters
      .filter(parameter => parameter.target)
      .map(parameter => ({
        id: parameter.id,
        type: parameter.type,
        target: parameter.target!,
        value: parameterValues[parameter.slug],
      }));

    result = await CardApi.query({
      cardId: questionId,
      parameters,
    });
  }

  return { card, result };
}
