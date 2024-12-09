import _ from "underscore";

import type {
  LoadSdkQuestionParams,
  SdkQuestionState,
} from "embedding-sdk/types/question";
import { resolveCards } from "metabase/query_builder/actions";
import { getParameterValuesForQuestion } from "metabase/query_builder/actions/core/parameterUtils";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Dispatch, GetState } from "metabase-types/store";

import { runQuestionQuerySdk } from "./run-question-query";

export const runQuestionOnLoadSdk =
  ({
    options = {},
    deserializedCard,
    cardId,
    cancelDeferred,
    initialSqlParameters,
  }: LoadSdkQuestionParams) =>
  async (
    dispatch: Dispatch,
    getState: GetState,
  ): Promise<SdkQuestionState & { originalQuestion?: Question }> => {
    const { card, originalCard } = await resolveCards({
      cardId: cardId ?? undefined,
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

    const result = await runQuestionQuerySdk({
      question,
      originalQuestion,
      cancelDeferred,
    });

    return { ...result, originalQuestion };
  };
