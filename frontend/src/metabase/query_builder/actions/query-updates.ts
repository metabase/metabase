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
    const nextV2Query = MetabaseLib.limit(query, limit);
    const nextV1Query = MetabaseLib.toV1Query(nextV2Query);
    dispatch(updateQuestion(nextV1Query, { run: true }));
  };
