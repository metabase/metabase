import type { Dispatch, GetState } from "metabase-types/store";

import * as Lib from "metabase-lib";
import type { Limit } from "metabase-lib/types";

import { getQuestion } from "../selectors";
import { updateQuestion } from "./core";

export const setLimit =
  (limit: Limit) => (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const question = getQuestion(state);
    if (!question) {
      return;
    }
    const query = question._getMLv2Query();
    const nextQuery = Lib.limit(query, limit);
    const nextLegacyQuery = Lib.toLegacyQuery(nextQuery);
    const nextQuestion = question.setDatasetQuery(nextLegacyQuery);
    dispatch(updateQuestion(nextQuestion, { run: true }));
  };
