import { updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import * as Lib from "metabase-lib";
import type {
  MetabotAggregateQueryReaction,
  MetabotBreakoutQueryReaction,
  MetabotLimitQueryReaction,
  MetabotSortQueryReaction,
} from "metabase-types/api";

import type { ReactionHandler } from "./types";

export const aggregateQuery: ReactionHandler<MetabotAggregateQueryReaction> =
  reaction =>
  async ({ dispatch, getState }) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    const query = question.query();
    const stageIndex = -1;
    const operators = Lib.availableAggregationOperators(query, stageIndex);
    const operator = operators.find(
      operator =>
        Lib.displayInfo(query, stageIndex, operator).displayName ===
        reaction.operator,
    );
    if (!operator) {
      return;
    }

    const columns = Lib.aggregationOperatorColumns(operator);
    const column = columns.find(
      column =>
        Lib.displayInfo(query, stageIndex, column).displayName ===
        reaction.column,
    );
    const operatorInfo = Lib.displayInfo(query, stageIndex, operator);
    if (operatorInfo.requiresColumn && !column) {
      return;
    }

    const newClause = Lib.aggregationClause(operator, column);
    const newQuery = Lib.aggregate(query, stageIndex, newClause);
    const newQuestion = question.setQuery(newQuery);
    await dispatch(updateQuestion(newQuestion, { run: true }));
  };

export const breakoutQuery: ReactionHandler<MetabotBreakoutQueryReaction> =
  reaction =>
  async ({ dispatch, getState }) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    const query = question.query();
    const stageIndex = -1;
    const columns = Lib.breakoutableColumns(query, stageIndex);
    const column = columns.find(
      column =>
        Lib.displayInfo(query, stageIndex, column).displayName ===
        reaction.column,
    );
    if (!column) {
      return;
    }

    const newQuery = Lib.breakout(
      query,
      stageIndex,
      Lib.withDefaultBucket(query, stageIndex, column),
    );
    const newQuestion = question.setQuery(newQuery);
    await dispatch(updateQuestion(newQuestion));
  };

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

    const newQuery = Lib.orderBy(query, stageIndex, column, reaction.direction);
    const newQuestion = question.setQuery(newQuery);
    await dispatch(updateQuestion(newQuestion));
  };

export const limitQuery: ReactionHandler<MetabotLimitQueryReaction> =
  reaction =>
  async ({ dispatch, getState }) => {
    const question = getQuestion(getState());
    if (!question) {
      return;
    }

    const query = question.query();
    const stageIndex = -1;
    const newQuery = Lib.limit(query, stageIndex, reaction.limit);
    const newQuestion = question.setQuery(newQuery);
    await dispatch(updateQuestion(newQuestion));
  };
