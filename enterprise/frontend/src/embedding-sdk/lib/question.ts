import { fetchAlertsForQuestion } from "metabase/alert/alert";
import { defer } from "metabase/lib/promise";
import { resolveCards } from "metabase/query_builder/actions";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { runQuestionQuery as apiRunQuestionQuery } from "metabase/services";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { isSavedCard } from "metabase-types/guards";
import type { Dispatch, GetState } from "metabase-types/store";

export const loadSdkQuestion =
  (questionId: number) => async (dispatch: Dispatch, getState: GetState) => {
    const { card, originalCard } = await resolveCards({
      cardId: questionId,
      deserializedCard: undefined,
      options: {},
      dispatch,
      getState,
    });

    if (isSavedCard(card)) {
      dispatch(fetchAlertsForQuestion(questionId));
    }

    await dispatch(loadMetadataForCard(card));

    const metadata = getMetadata(getState());

    const originalQuestion = new Question(originalCard, metadata);
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
      ? question.isQueryDirtyComparedTo(originalQuestion)
      : true;

    if (question.canRun() && (question.isSaved() || !isNative)) {
      const queryResults = await apiRunQuestionQuery(question, {
        cancelDeferred: cancelQueryDeferred,
        ignoreCache: false,
        isDirty: isQueryDirty,
      });

      // eslint-disable-next-line no-console
      console.log(`Query Results:`, queryResults);

      return queryResults;
    }
  };
