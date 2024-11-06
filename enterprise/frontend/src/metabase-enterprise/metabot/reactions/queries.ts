import { updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";
import type { MetabotSortQueryReaction } from "metabase-types/api";

import type { ReactionHandler } from "./types";

export const sortQuery: ReactionHandler<MetabotSortQueryReaction> =
  reaction =>
  async ({ dispatch, getState }) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    const query = question.query();
    const stageIndex = -1;
    const columns = Lib.orderableColumns(query, stageIndex);
    const column = columns.find(
      column =>
        Lib.displayInfo(query, stageIndex, column).displayName ===
        reaction.column,
    );
    if (!column) {
      return;
    }

    const newQuery = Lib.orderBy(query, stageIndex, column);
    const newQuestion = question.setQuery(newQuery);
    await dispatch(updateQuestion(newQuestion, { run: true }));
  };
