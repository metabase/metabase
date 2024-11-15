import { updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import type { MetabotRunQueryReaction } from "metabase-types/api";

import type { ReactionHandler } from "./types";

export const runQuery: ReactionHandler<MetabotRunQueryReaction> =
  reaction =>
  async ({ dispatch, getState }) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    const newQuestion = question.setDatasetQuery(reaction.dataset_query);
    await dispatch(updateQuestion(newQuestion, { run: true }));
  };
