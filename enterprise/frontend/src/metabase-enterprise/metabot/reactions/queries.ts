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
    const orderBys = reaction.order_bys ?? [];
    const limits = reaction.limits ?? [];

    const queryWithOrderBy = orderBys.reduce((newQuery, details) => {
      const columns = Lib.orderableColumns(query, stageIndex);
      const column = columns.find(
        column =>
          Lib.displayInfo(query, stageIndex, column).displayName ===
          details.column,
      );
      if (!column) {
        return newQuery;
      }
      return Lib.orderBy(newQuery, stageIndex, column);
    }, query);

    const queryWithLimit = limits.reduce((newQuery, details) => {
      return Lib.limit(query, stageIndex, details.limit);
    }, queryWithOrderBy);

    const newQuestion = question.setQuery(queryWithLimit);
    await dispatch(updateQuestion(newQuestion, { run: true }));
  };
