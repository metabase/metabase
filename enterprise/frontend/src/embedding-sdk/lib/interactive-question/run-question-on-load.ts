import type {
  LoadSdkQuestionParams,
  SdkQuestionResult,
} from "embedding-sdk/types/question";
import * as Urls from "metabase/lib/urls";
import {
  deserializeCard,
  parseHash,
  resolveCards,
} from "metabase/query_builder/actions";
import { getParameterValuesForQuestion } from "metabase/query_builder/actions/core/parameterUtils";
import { syncQuestionTemplateTagParameters } from "metabase/query_builder/actions/core/utils";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Dispatch, GetState } from "metabase-types/store";

import { runQuestionQuerySdk } from "./run-question-query";

export const runQuestionOnLoadSdk =
  ({ location, params, cancelDeferred }: LoadSdkQuestionParams) =>
  async (
    dispatch: Dispatch,
    getState: GetState,
  ): Promise<SdkQuestionResult & { originalQuestion?: Question }> => {
    const cardId = Urls.extractEntityId(params.slug);
    const { options, serializedCard } = parseHash(location.hash);

    const { card, originalCard } = await resolveCards({
      cardId,
      options,
      dispatch,
      getState,
      deserializedCard: serializedCard && deserializeCard(serializedCard),
    });

    await dispatch(loadMetadataForCard(card));
    const metadata = getMetadata(getState());

    let question = new Question(card, metadata);

    question = syncQuestionTemplateTagParameters(question);

    const parameterValues = getParameterValuesForQuestion({
      card,
      metadata,
      queryParams: location.query,
    });

    if (parameterValues) {
      question = question.setParameterValues(parameterValues);
    }

    const originalQuestion =
      originalCard && new Question(originalCard, metadata);

    const result = await runQuestionQuerySdk({
      question,
      originalQuestion,
      cancelDeferred,
    });

    return { ...result, originalQuestion };
  };
