import type { Deferred } from "metabase/lib/promise";
import { CardApi } from "metabase/services";
import type { Card, Dataset, ParameterQueryObject } from "metabase-types/api";

interface Options {
  questionId: number;
  sqlParameters?: Record<string, string | number>;
  cancelDeferred?: Deferred;
}

type ParameterQueryInput = { id: string } & ParameterQueryObject;

export async function loadStaticQuestion(options: Options) {
  const { questionId, sqlParameters, cancelDeferred } = options;

  let card: Card | null;
  let result: Dataset | null;

  const cancelled = cancelDeferred?.promise;

  [card, result] = await Promise.all([
    CardApi.get({ cardId: questionId }, { cancelled }),

    // Query the card in parallel when no parameters are provided.
    !sqlParameters && CardApi.query({ cardId: questionId }, { cancelled }),
  ]);

  if (sqlParameters && card?.parameters) {
    const parameters: ParameterQueryInput[] = card.parameters
      .filter(parameter => parameter.target)
      .map(parameter => ({
        id: parameter.id,
        type: parameter.type,
        target: parameter.target!,
        value: sqlParameters[parameter.slug],
      }));

    result = await CardApi.query(
      { cardId: questionId, parameters },
      { cancelled },
    );
  }

  return { card, result };
}
