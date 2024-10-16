import type { Deferred } from "metabase/lib/promise";
import { CardApi } from "metabase/services";
import type { Card, Dataset, ParameterQueryObject } from "metabase-types/api";

interface Options {
  questionId: number;
  parameterValues?: Record<string, string | number>;
  cancelDeferred?: Deferred;
}

type ParameterQueryInput = { id: string } & ParameterQueryObject;

// @ts-expect-error - foo bar
window.CardApi = CardApi;

export async function loadStaticQuestion(options: Options) {
  const { questionId, parameterValues, cancelDeferred } = options;

  let card: Card | null;
  let result: Dataset | null;

  [card, result] = await Promise.all([
    CardApi.get({ cardId: questionId }, { cancelled: cancelDeferred?.promise }),

    // Query the card in parallel when no parameters are provided.
    !parameterValues &&
      CardApi.query(
        { cardId: questionId },
        { cancelled: cancelDeferred?.promise },
      ),
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

    result = await CardApi.query(
      {
        cardId: questionId,
        parameters,
      },
      { cancelled: cancelDeferred?.promise },
    );
  }

  return { card, result };
}
