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
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Dispatch, GetState } from "metabase-types/store";

import { runQuestionQuerySdk } from "./run-question-query";

export const runQuestionOnLoadSdk =
  ({
    cardId,
    deserializedCard,
    options,
    cancelDeferred,
  }: LoadSdkQuestionParams) =>
  async (
    dispatch: Dispatch,
    getState: GetState,
  ): Promise<SdkQuestionResult & { originalQuestion?: Question }> => {
    // const cardId = Urls.extractEntityId(slug);
    // const { options, serializedCard } = parseHash(hash);

    const { card, originalCard } = await resolveCards({
      cardId,
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
