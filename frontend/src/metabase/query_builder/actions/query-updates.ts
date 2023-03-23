import type { Dispatch, GetState } from "metabase-types/store";

import * as MetabaseLib from "metabase-lib/v2";
import type { Limit } from "metabase-lib/v2/types";

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
    const nextQuery = MetabaseLib.limit(query, limit);
    const nextLegacyQuery = MetabaseLib.toLegacyQuery(nextQuery);
    const nextQuestion = question.setDatasetQuery(nextLegacyQuery);
    dispatch(updateQuestion(nextQuestion, { run: true }));
  };
