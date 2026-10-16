import { useCallback } from "react";
import _ from "underscore";

import { useDispatch } from "metabase/redux";
import type { Dispatch } from "metabase/redux/store";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { runQuestionQuery, updateQuestion } from "../../../actions";

/**
 * Replaces the question and runs it. The query builder skips the run when a pivot stays a pivot
 * with the same layout, but here the query itself may have changed, so it runs anyway.
 */
export const updateExploreQuestion =
  (currentQuestion: Question, nextQuestion: Question) =>
  async (dispatch: Dispatch) => {
    await dispatch(updateQuestion(nextQuestion, { run: true }));
    const staysPivot =
      currentQuestion.display() === "pivot" &&
      nextQuestion.display() === "pivot";
    const hasQueryChanged = !_.isEqual(
      Lib.toJsQuery(currentQuestion.query()),
      Lib.toJsQuery(nextQuestion.query()),
    );
    if (staysPivot && hasQueryChanged) {
      dispatch(runQuestionQuery());
    }
  };

export function useExploreUpdate() {
  const dispatch = useDispatch();
  return useCallback(
    (currentQuestion: Question, nextQuestion: Question) =>
      dispatch(updateExploreQuestion(currentQuestion, nextQuestion)),
    [dispatch],
  );
}
