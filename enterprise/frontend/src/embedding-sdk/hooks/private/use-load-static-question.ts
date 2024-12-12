import { useEffect, useMemo, useState } from "react";

import { getParameterDependencyKey } from "embedding-sdk/lib/load-question-utils";
import { skipToken, useGetCardQuery, useGetCardQueryQuery } from "metabase/api";
import { isNullOrUndefined } from "metabase/lib/types";
import { getTemplateTagParametersFromCard } from "metabase-lib/v1/parameters/utils/template-tags";
import type { Card } from "metabase-types/api";

interface LoadStaticQuestionParams {
  questionId: number | null;
  initialSqlParameters?: Record<string, string | number>;
}

export function useLoadStaticQuestion({
  questionId,
  initialSqlParameters,
}: LoadStaticQuestionParams) {
  // Card can be mutated after loading, e.g. when updating visualization types.
  const [mutableCard, setMutableCard] = useState<Card | null>(null);

  const {
    data: fetchedCard,
    isLoading: isCardLoading,
    error: cardError,
  } = useGetCardQuery(
    !isNullOrUndefined(questionId) ? { id: questionId } : skipToken,
  );

  const hasSqlParameterValues =
    Object.keys(initialSqlParameters ?? {}).length > 0;

  // Avoid re-running the query if the parameters haven't changed.
  const sqlParametersKey = getParameterDependencyKey(initialSqlParameters);

  const parameters = useMemo(
    () => {
      if (!fetchedCard) {
        return null;
      }

      return getTemplateTagParametersFromCard(fetchedCard)
        .filter(parameter => parameter.target)
        .map(parameter => ({
          id: parameter.id,
          type: parameter.type,
          target: parameter.target,
          value: initialSqlParameters?.[parameter.slug],
        }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchedCard, sqlParametersKey],
  );

  const isParametersEmptyOrReady = !hasSqlParameterValues || !!fetchedCard;

  const {
    data: queryResult,
    isLoading: isQueryResultLoading,
    error: queryResultError,
  } = useGetCardQueryQuery(
    !isNullOrUndefined(questionId) && isParametersEmptyOrReady
      ? { cardId: questionId, ...(parameters ? { parameters } : {}) }
      : skipToken,
  );

  // After the card is loaded, update the mutable card.
  useEffect(() => {
    if (fetchedCard) {
      setMutableCard(fetchedCard);
    }
  }, [fetchedCard]);

  return {
    card: mutableCard,
    queryResult,
    loading: isCardLoading || isQueryResultLoading,
    error: cardError || queryResultError,

    // Allows the card to be updated, e.g. when updating visualization types.
    setCard: (card: Card) => setMutableCard(card),
  };
}
