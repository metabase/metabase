import _ from "underscore";

import type {
  SdkDispatch,
  SdkStoreState,
} from "embedding-sdk-bundle/store/types";
import type { LoadSdkQuestionParams } from "embedding-sdk-bundle/types/question";
import { resolveCards } from "metabase/query_builder/actions";
import { getParameterValuesForQuestion } from "metabase/query_builder/actions/core/parameterUtils";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";

export const loadQuestionSdk =
  ({
    options = {},
    deserializedCard,
    questionId: initQuestionId,
    initialSqlParameters,
    targetDashboardId,
  }: LoadSdkQuestionParams) =>
  async (
    dispatch: SdkDispatch,
    getState: () => SdkStoreState,
  ): Promise<{ question: Question; originalQuestion?: Question }> => {
    const questionId = initQuestionId === "new" ? undefined : initQuestionId;

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
    if (targetDashboardId) {
      question = question.setDashboardId(targetDashboardId);
    }

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
