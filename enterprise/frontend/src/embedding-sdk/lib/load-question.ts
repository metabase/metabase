import type { SdkQuestionResult } from "embedding-sdk/types/question";
import { defer } from "metabase/lib/promise";
import { resolveCards } from "metabase/query_builder/actions";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { runQuestionQuery } from "metabase/services";
import * as Lib from "metabase-lib";
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

    let question = new Question(card, metadata);

    const query = question.query();
    const { isNative } = Lib.queryDisplayInfo(query);

    if (question.isSaved()) {
      const type = question.type();

      if (type === "question") {
        question = question.lockDisplay();
      }
    }

    const cancelQueryDeferred = defer();

    const isQueryDirty = originalCard
      ? question.isQueryDirtyComparedTo(new Question(originalCard, metadata))
      : true;

    let queryResults;

    if (question.canRun() && (question.isSaved() || !isNative)) {
      queryResults = await runQuestionQuery(question, {
        cancelDeferred: cancelQueryDeferred,
        ignoreCache: false,
        isDirty: isQueryDirty,
      });
    }

    // FIXME: this removes "You can also get an alert when there are some results." feature for question
    if (question) {
      question.alertType = () => null;
    }

    return {
      card,
      question,
      queryResults,
    };
  };
