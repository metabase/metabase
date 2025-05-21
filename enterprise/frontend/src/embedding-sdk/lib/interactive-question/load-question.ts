import _ from "underscore";

import type { LoadSdkQuestionParams } from "embedding-sdk/types/question";
import { fetchEntityId } from "metabase/lib/entity-id/fetch-entity-id";
import { resolveCards } from "metabase/query_builder/actions";
import { getParameterValuesForQuestion } from "metabase/query_builder/actions/core/parameterUtils";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { CardId } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

export const loadQuestionSdk =
  ({
    options = {},
    deserializedCard,
    questionId: initQuestionId,
    initialSqlParameters,
  }: LoadSdkQuestionParams) =>
  async (
    dispatch: Dispatch,
    getState: GetState,
  ): Promise<{ question: Question; originalQuestion?: Question }> => {
    const { id: questionId, isError } = (await dispatch(
      fetchEntityId({ type: "card", id: initQuestionId }),
    )) as { id: CardId | null; isError: boolean };

    if (isError && !deserializedCard) {
      throw new Error("No question ID or data found.");
    }

    const { card, originalCard } = await resolveCards({
      cardId: questionId ?? undefined,
      options,
      dispatch,
      getState,
      deserializedCard,
    });

    await dispatch(loadMetadataForCard(card));
    const metadata = getMetadata(getState());

    const originalQuestion =
      originalCard && new Question(originalCard, metadata);

    let question = new Question(card, metadata);

    question = question.applyTemplateTagParameters();

    const queryParams = initialSqlParameters
      ? _.mapObject(initialSqlParameters, String)
      : {};

    const parameterValues = getParameterValuesForQuestion({
      card,
      metadata,
      queryParams,
    });

    if (parameterValues) {
      question = question.setParameterValues(parameterValues);
    }

    return { question, originalQuestion };
  };
