import { updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";
import type { MetabotChangeQueryReaction } from "metabase-types/api";

import type { ReactionHandler } from "./types";

export const changeQuery: ReactionHandler<MetabotChangeQueryReaction> =
  reaction =>
  async ({ dispatch, getState }) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    const query = question.query();
    const stageIndex = -1;

    const breakoutDetails = reaction.breakouts ?? [];
    const queryWithBreakouts = breakoutDetails.reduce((newQuery, details) => {
      const columns = Lib.breakoutableColumns(newQuery, stageIndex);
      const column = columns.find(
        column =>
          Lib.displayInfo(newQuery, stageIndex, column).displayName ===
          details.column,
      );
      if (!column) {
        return newQuery;
      }

      return Lib.breakout(
        newQuery,
        stageIndex,
        Lib.withDefaultBucket(newQuery, stageIndex, column),
      );
    }, query);

    const orderByDetails = reaction.order_bys ?? [];
    const queryWithOrderBy = orderByDetails.reduce((newQuery, details) => {
      const columns = Lib.orderableColumns(newQuery, stageIndex);
      const column = columns.find(
        column =>
          Lib.displayInfo(newQuery, stageIndex, column).displayName ===
          details.column,
      );
      if (!column) {
        return newQuery;
      }
      return Lib.orderBy(newQuery, stageIndex, column);
    }, queryWithBreakouts);

    const limitDetails = reaction.limits ?? [];
    const queryWithLimit = limitDetails.reduce((newQuery, details) => {
      return Lib.limit(newQuery, stageIndex, details.limit);
    }, queryWithOrderBy);

    const newQuestion = question.setQuery(queryWithLimit);
    await dispatch(updateQuestion(newQuestion, { run: true }));
  };
