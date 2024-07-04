import { runQuestionQuerySdk } from "embedding-sdk/lib/run-question-query";
import type { SdkQuestionResult } from "embedding-sdk/types/question";
import { resolveCards } from "metabase/query_builder/actions";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Dispatch, GetState } from "metabase-types/store";

export const loadSdkQuestion =
  (questionId: number) =>
  async (
    dispatch: Dispatch,
    getState: GetState,
  ): Promise<SdkQuestionResult> => {
    const { card, originalCard } = await resolveCards({
      cardId: questionId,
      deserializedCard: undefined,
      options: {},
      dispatch,
      getState,
    });

    await dispatch(loadMetadataForCard(card));
    const metadata = getMetadata(getState());

    const { question, queryResults } = await runQuestionQuerySdk({
      question: new Question(card, metadata),
      originalQuestion: originalCard && new Question(originalCard, metadata),
    });

    return { question, queryResults };
  };
