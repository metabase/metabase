import type { Limit } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { Dispatch, GetState } from "metabase-types/store";

import { getQuestion } from "../selectors";

import { updateQuestion } from "./core";

export const setLimit =
  (limit: Limit) => (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const question = getQuestion(state);
    if (!question) {
      return;
    }
    const query = question.query();
    const nextQuery = Lib.limit(query, -1, limit);
    const nextQuestion = question.setQuery(nextQuery);
    dispatch(updateQuestion(nextQuestion, { run: true }));
  };
