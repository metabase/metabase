import { updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import type {
  MetabotAggregateDataReaction,
  MetabotFilterDataReaction,
} from "metabase-types/api";

import type { ReactionHandler } from "./types";

export const filterData: ReactionHandler<MetabotFilterDataReaction> =
  reaction =>
  async ({ dispatch, getState }) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    const newQuestion = question.setDatasetQuery(reaction.dataset_query);
    await dispatch(updateQuestion(newQuestion, { run: true }));
  };

export const aggregateData: ReactionHandler<MetabotAggregateDataReaction> =
  reaction =>
  async ({ dispatch, getState }) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    const newQuestion = question.setDatasetQuery(reaction.dataset_query);
    await dispatch(updateQuestion(newQuestion, { run: true }));
  };
