import type { LocationDescriptorObject } from "history";

import { runQuestionQuerySdk } from "embedding-sdk/lib/run-question-query";
import type { SdkQuestionResult } from "embedding-sdk/types/question";
import * as Urls from "metabase/lib/urls";
import {
  deserializeCard,
  parseHash,
  type QueryParams,
  resolveCards,
} from "metabase/query_builder/actions";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type { Dispatch, GetState } from "metabase-types/store";

export interface LoadSdkQuestionParams {
  location: LocationDescriptorObject;
  params: QueryParams;
}

export const loadSdkQuestion =
  ({ location, params }: LoadSdkQuestionParams) =>
  async (
    dispatch: Dispatch,
    getState: GetState,
  ): Promise<SdkQuestionResult> => {
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

    return runQuestionQuerySdk({
      question: new Question(card, metadata),
      originalQuestion: originalCard && new Question(originalCard, metadata),
    });
  };
