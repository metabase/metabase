import type {
  LoadSdkQuestionParams,
  SdkQuestionState,
} from "embedding-sdk/types/question";
import { resolveCards } from "metabase/query_builder/actions";
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

    const result = await runQuestionQuerySdk({
      question: new Question(card, metadata),
      originalQuestion,
      cancelDeferred,
    });

    return { ...result, originalQuestion };
  };
